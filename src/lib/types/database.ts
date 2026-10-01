export type EventCategory = 'concert' | 'theatre' | 'comedy' | 'sports' | 'family' | 'local'
export type EventStatus = 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | 'postponed'

// News Intelligence Inbox (Phase 1) — see supabase/migration_026_news_candidates.sql
export type NewsScopeType = 'national' | 'city'
export type NewsStoryType = 'presale' | 'tour_announcement' | 'new_dates' | 'venue_news' | 'general_entertainment'
export type NewsPriority = 'low' | 'normal' | 'high'
export type NewsReviewStatus = 'pending' | 'approved' | 'rejected' | 'published'
export type NewsIntakeMethod = 'manual' | 'url_import'
export type NewsAiReviewStatus = 'not_applicable' | 'unreviewed' | 'reviewed'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      venues: {
        Row: {
          id: string
          name: string
          slug: string
          address: string
          city: string
          postcode: string
          country: string
          capacity: number | null
          lat: number | null
          lng: number | null
          website: string | null
          image_url: string | null
          ticketmaster_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          address: string
          city: string
          postcode: string
          country?: string
          capacity?: number | null
          lat?: number | null
          lng?: number | null
          website?: string | null
          image_url?: string | null
          ticketmaster_id?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          address?: string
          city?: string
          postcode?: string
          country?: string
          capacity?: number | null
          lat?: number | null
          lng?: number | null
          website?: string | null
          image_url?: string | null
          ticketmaster_id?: string | null
        }
      }
      artists: {
        Row: {
          id: string
          name: string
          slug: string
          bio: string | null
          genre: string | null
          image_url: string | null
          website: string | null
          spotify_id: string | null
          ticketmaster_id: string | null
          description: string | null
          tour_name: string | null
          onsale_date: string | null
          tickets_url: string | null
          is_featured: boolean
          featured_onsale: boolean
          gigsberg_url: string | null
          viagogo_url: string | null
          stubhub_url: string | null
          vivid_seats_url: string | null
          see_tickets_url: string | null
          eventim_url: string | null
          axs_url: string | null
          gigantic_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          bio?: string | null
          genre?: string | null
          image_url?: string | null
          website?: string | null
          spotify_id?: string | null
          ticketmaster_id?: string | null
          description?: string | null
          tour_name?: string | null
          onsale_date?: string | null
          tickets_url?: string | null
          is_featured?: boolean
          featured_onsale?: boolean
          gigsberg_url?: string | null
          viagogo_url?: string | null
          stubhub_url?: string | null
          vivid_seats_url?: string | null
          see_tickets_url?: string | null
          eventim_url?: string | null
          axs_url?: string | null
          gigantic_url?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          bio?: string | null
          genre?: string | null
          image_url?: string | null
          website?: string | null
          spotify_id?: string | null
          ticketmaster_id?: string | null
          description?: string | null
          tour_name?: string | null
          onsale_date?: string | null
          tickets_url?: string | null
          is_featured?: boolean
          featured_onsale?: boolean
          gigsberg_url?: string | null
          viagogo_url?: string | null
          stubhub_url?: string | null
          vivid_seats_url?: string | null
          see_tickets_url?: string | null
          eventim_url?: string | null
          axs_url?: string | null
          gigantic_url?: string | null
        }
      }
      tours: {
        Row: {
          id: string
          artist_id: string
          tour_name: string
          onsale_date: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          tour_name: string
          onsale_date?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          tour_name?: string
          onsale_date?: string | null
          description?: string | null
        }
      }
      tour_dates: {
        Row: {
          id: string
          tour_id: string
          date: string
          venue_name: string
          city: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          tour_id: string
          date: string
          venue_name: string
          city: string
          status?: string
          created_at?: string
        }
        Update: {
          date?: string
          venue_name?: string
          city?: string
          status?: string
        }
      }
      events: {
        Row: {
          id: string
          title: string
          slug: string
          description: string | null
          category: EventCategory
          venue_id: string
          start_date: string
          end_date: string | null
          doors_time: string | null
          onsale_date: string | null
          public_onsale_start: string | null
          public_onsale_end: string | null
          presale_start: string | null
          presale_end: string | null
          presale_name: string | null
          on_sale_this_week: boolean
          presale_this_week: boolean
          upcoming_presale: boolean
          newly_announced: boolean
          last_synced_at: string | null
          image_url: string | null
          price_from: number | null
          price_to: number | null
          currency: string
          tickets_url: string | null
          own_ticket_url: string | null
          status: EventStatus
          is_featured: boolean
          tags: string[] | null
          ticketmaster_id: string | null
          source: string | null
          source_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug: string
          description?: string | null
          category: EventCategory
          venue_id: string
          start_date: string
          end_date?: string | null
          doors_time?: string | null
          onsale_date?: string | null
          public_onsale_start?: string | null
          public_onsale_end?: string | null
          presale_start?: string | null
          presale_end?: string | null
          presale_name?: string | null
          on_sale_this_week?: boolean
          presale_this_week?: boolean
          upcoming_presale?: boolean
          newly_announced?: boolean
          last_synced_at?: string | null
          image_url?: string | null
          price_from?: number | null
          price_to?: number | null
          currency?: string
          tickets_url?: string | null
          own_ticket_url?: string | null
          status?: EventStatus
          is_featured?: boolean
          tags?: string[] | null
          ticketmaster_id?: string | null
          source?: string | null
          source_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          slug?: string
          description?: string | null
          category?: EventCategory
          venue_id?: string
          start_date?: string
          end_date?: string | null
          doors_time?: string | null
          onsale_date?: string | null
          public_onsale_start?: string | null
          public_onsale_end?: string | null
          presale_start?: string | null
          presale_end?: string | null
          presale_name?: string | null
          on_sale_this_week?: boolean
          presale_this_week?: boolean
          upcoming_presale?: boolean
          newly_announced?: boolean
          last_synced_at?: string | null
          image_url?: string | null
          price_from?: number | null
          price_to?: number | null
          currency?: string
          tickets_url?: string | null
          own_ticket_url?: string | null
          status?: EventStatus
          is_featured?: boolean
          tags?: string[] | null
          ticketmaster_id?: string | null
          updated_at?: string
        }
      }
      event_artists: {
        Row: {
          event_id: string
          artist_id: string
          is_headliner: boolean
          order: number
        }
        Insert: {
          event_id: string
          artist_id: string
          is_headliner?: boolean
          order?: number
        }
        Update: {
          is_headliner?: boolean
          order?: number
        }
      }
      user_favorites: {
        Row: {
          user_id: string
          event_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          event_id: string
          created_at?: string
        }
        Update: never
      }
      subscribers: {
        Row: {
          id: string
          email: string
          confirmed: boolean
          city: string | null
          unsubscribed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          confirmed?: boolean
          city?: string | null
          unsubscribed_at?: string | null
          created_at?: string
        }
        Update: {
          confirmed?: boolean
          city?: string | null
          unsubscribed_at?: string | null
        }
      }
      newsletters: {
        Row: {
          id: string
          subject: string
          intro: string
          article_ids: string[]
          status: 'draft' | 'sent'
          test_sent_at: string | null
          test_sent_to: string | null
          sent_at: string | null
          sent_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subject: string
          intro?: string
          article_ids?: string[]
          status?: 'draft' | 'sent'
          test_sent_at?: string | null
          test_sent_to?: string | null
          sent_at?: string | null
          sent_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          subject?: string
          intro?: string
          article_ids?: string[]
          status?: 'draft' | 'sent'
          test_sent_at?: string | null
          test_sent_to?: string | null
          sent_at?: string | null
          sent_count?: number | null
          updated_at?: string
        }
      }
      local_businesses: {
        Row: {
          id: string
          city: string
          name: string
          category: 'restaurant' | 'bar' | 'hotel' | 'transport' | 'beauty' | 'other'
          description: string | null
          website_url: string | null
          is_sponsored: boolean
          is_lusso_client: boolean
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          city: string
          name: string
          category: 'restaurant' | 'bar' | 'hotel' | 'transport' | 'beauty' | 'other'
          description?: string | null
          website_url?: string | null
          is_sponsored?: boolean
          is_lusso_client?: boolean
          display_order?: number
          created_at?: string
        }
        Update: {
          city?: string
          name?: string
          category?: 'restaurant' | 'bar' | 'hotel' | 'transport' | 'beauty' | 'other'
          description?: string | null
          website_url?: string | null
          is_sponsored?: boolean
          is_lusso_client?: boolean
          display_order?: number
        }
      }
      city_news: {
        Row: {
          id: string
          city_slug: string
          city_name: string
          headline: string
          url: string
          source: string | null
          published_at: string | null
          fetched_at: string
          is_editorial: boolean
        }
        Insert: {
          id?: string
          city_slug: string
          city_name: string
          headline: string
          url: string
          source?: string | null
          published_at?: string | null
          fetched_at?: string
          is_editorial?: boolean
        }
        Update: {
          city_slug?: string
          city_name?: string
          headline?: string
          url?: string
          source?: string | null
          published_at?: string | null
          fetched_at?: string
          is_editorial?: boolean
        }
      }
      news_candidates: {
        Row: {
          id: string
          scope_type: NewsScopeType
          city_slug: string | null
          city_name: string | null
          headline: string
          source: string | null
          source_url: string | null
          url: string
          published_at: string | null
          discovered_at: string
          story_type: NewsStoryType
          artist_name: string | null
          artist_id: string | null
          summary: string | null
          editorial_note: string | null
          priority: NewsPriority
          review_status: NewsReviewStatus
          reviewed_at: string | null
          published_to_city_news_at: string | null
          created_by: string | null
          reviewed_by: string | null
          intake_method: NewsIntakeMethod
          extracted_content: Record<string, unknown> | null
          ai_suggestions: Record<string, unknown> | null
          ai_model: string | null
          ai_generated_at: string | null
          ai_review_status: NewsAiReviewStatus
          publish_to_homepage: boolean
          publish_to_news_page: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scope_type: NewsScopeType
          city_slug?: string | null
          city_name?: string | null
          headline: string
          source?: string | null
          source_url?: string | null
          url: string
          published_at?: string | null
          discovered_at?: string
          story_type?: NewsStoryType
          artist_name?: string | null
          artist_id?: string | null
          summary?: string | null
          editorial_note?: string | null
          priority?: NewsPriority
          review_status?: NewsReviewStatus
          reviewed_at?: string | null
          published_to_city_news_at?: string | null
          created_by?: string | null
          reviewed_by?: string | null
          intake_method?: NewsIntakeMethod
          extracted_content?: Record<string, unknown> | null
          ai_suggestions?: Record<string, unknown> | null
          ai_model?: string | null
          ai_generated_at?: string | null
          ai_review_status?: NewsAiReviewStatus
          publish_to_homepage?: boolean
          publish_to_news_page?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          scope_type?: NewsScopeType
          city_slug?: string | null
          city_name?: string | null
          headline?: string
          source?: string | null
          source_url?: string | null
          url?: string
          published_at?: string | null
          discovered_at?: string
          story_type?: NewsStoryType
          artist_name?: string | null
          artist_id?: string | null
          summary?: string | null
          editorial_note?: string | null
          priority?: NewsPriority
          review_status?: NewsReviewStatus
          reviewed_at?: string | null
          published_to_city_news_at?: string | null
          created_by?: string | null
          reviewed_by?: string | null
          intake_method?: NewsIntakeMethod
          extracted_content?: Record<string, unknown> | null
          ai_suggestions?: Record<string, unknown> | null
          ai_model?: string | null
          ai_generated_at?: string | null
          ai_review_status?: NewsAiReviewStatus
          publish_to_homepage?: boolean
          publish_to_news_page?: boolean
          updated_at?: string
        }
      }
      news_candidate_cities: {
        Row: {
          candidate_id: string
          city_slug: string
          city_name: string
        }
        Insert: {
          candidate_id: string
          city_slug: string
          city_name: string
        }
        Update: {
          candidate_id?: string
          city_slug?: string
          city_name?: string
        }
      }
    }
    Views: {
      events_with_venue: {
        Row: {
          id: string
          title: string
          slug: string
          description: string | null
          category: EventCategory
          start_date: string
          end_date: string | null
          image_url: string | null
          price_from: number | null
          price_to: number | null
          currency: string
          tickets_url: string | null
          status: EventStatus
          is_featured: boolean
          onsale_date: string | null
          public_onsale_start: string | null
          public_onsale_end: string | null
          presale_start: string | null
          presale_end: string | null
          presale_name: string | null
          on_sale_this_week: boolean
          presale_this_week: boolean
          upcoming_presale: boolean
          newly_announced: boolean
          last_synced_at: string | null
          venue_id: string
          venue_name: string
          venue_slug: string | null
          venue_city: string
          venue_postcode: string
          venue_capacity: number | null
        }
      }
    }
    Functions: Record<string, never>
    Enums: {
      event_category: EventCategory
      event_status: EventStatus
    }
  }
}

// Convenience row types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Venue = Database['public']['Tables']['venues']['Row']
export type Artist   = Database['public']['Tables']['artists']['Row']
export type Tour     = Database['public']['Tables']['tours']['Row']
export type TourDate = Database['public']['Tables']['tour_dates']['Row']
export type Event = Database['public']['Tables']['events']['Row']
export type EventArtist = Database['public']['Tables']['event_artists']['Row']
export type UserFavorite = Database['public']['Tables']['user_favorites']['Row']
export type EventWithVenue = Database['public']['Views']['events_with_venue']['Row']
export type LocalBusiness = Database['public']['Tables']['local_businesses']['Row']
export type CityNews = Database['public']['Tables']['city_news']['Row']
export type NewsCandidate = Database['public']['Tables']['news_candidates']['Row']
export type NewsCandidateCity = Database['public']['Tables']['news_candidate_cities']['Row']
export type Subscriber = Database['public']['Tables']['subscribers']['Row']
export type Newsletter = Database['public']['Tables']['newsletters']['Row']
