import { NextResponse } from 'next/server'
import { CITIES } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_FILES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ASSETS = 5

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'upload'
}

function normaliseCategory(value: string) {
  return value.toLowerCase().replace(' or pub', '').replace(' or b&b', '').replace('é', 'e').replace(/\s+/g, '_')
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const city = text(form.get('city'))
    const packageKey = text(form.get('package'))
    const businessName = text(form.get('business_name'))
    const category = normaliseCategory(text(form.get('category')))
    const contactName = text(form.get('contact_name'))
    const email = text(form.get('email')).toLowerCase()
    const phone = text(form.get('phone'))
    const websiteUrl = text(form.get('website_url'))
    const description = text(form.get('description'))
    const logo = form.get('logo')
    const assets = form.getAll('assets').filter(value => value instanceof File) as File[]

    if (!CITIES.some(item => item.name === city)) return NextResponse.json({ error: 'Please choose a valid city.' }, { status: 400 })
    if (packageKey !== 'featured' && packageKey !== 'standard') return NextResponse.json({ error: 'Please choose a valid package.' }, { status: 400 })
    if (businessName.length < 2 || contactName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Please provide a business name, contact name and valid email address.' }, { status: 400 })
    }
    if (logo instanceof File && logo.size > 0 && (!ALLOWED_FILES.has(logo.type) || logo.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: 'The logo must be a PNG, JPG or WebP file up to 5MB.' }, { status: 400 })
    }
    if (assets.length > MAX_ASSETS || assets.some(file => !ALLOWED_FILES.has(file.type) || file.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: 'Please upload no more than five PNG, JPG, WebP or PDF files, up to 5MB each.' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data: application, error: insertError } = await db
      .from('advertiser_applications')
      .insert({
        city,
        package: packageKey,
        business_name: businessName,
        category,
        contact_name: contactName,
        email,
        phone: phone || null,
        website_url: websiteUrl || null,
        description: description || null,
      })
      .select('id')
      .single()

    if (insertError || !application) {
      console.error('[advertiser-onboarding] insert failed', insertError?.message)
      return NextResponse.json({ error: 'We could not save your application. Please try again.' }, { status: 500 })
    }

    const uploadedPaths: string[] = []
    const files: Array<{ file: File; kind: string }> = []
    if (logo instanceof File && logo.size > 0) files.push({ file: logo, kind: 'logo' })
    assets.forEach((file, index) => files.push({ file, kind: `asset-${index + 1}` }))

    for (const { file, kind } of files) {
      const path = `${application.id}/${kind}-${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await db.storage.from('advertiser-assets').upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) {
        console.error('[advertiser-onboarding] upload failed', uploadError.message)
        await db.from('advertiser_applications').delete().eq('id', application.id)
        return NextResponse.json({ error: 'One of the uploaded files could not be saved. Please try again.' }, { status: 500 })
      }
      uploadedPaths.push(path)
    }

    if (uploadedPaths.length > 0) {
      await db.from('advertiser_applications').update({
        logo_path: uploadedPaths.find(path => path.includes('/logo-')) ?? null,
        asset_paths: uploadedPaths.filter(path => !path.includes('/logo-')),
        updated_at: new Date().toISOString(),
      }).eq('id', application.id)
    }

    return NextResponse.json({ ok: true, applicationId: application.id })
  } catch (error) {
    console.error('[advertiser-onboarding] unexpected error', error)
    return NextResponse.json({ error: 'We could not submit your application. Please try again.' }, { status: 500 })
  }
}
