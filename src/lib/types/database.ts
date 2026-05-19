export type EventCategory = 'concert' | 'theatre' | 'comedy' | 'sports' | 'family'
export type EventStatus = 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | 'postponed'

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
          image_url: string | null
          price_from: number | null
          price_to: number | null
          currency: string
          tickets_url: string | null
          status: EventStatus
          is_featured: boolean
          tags: string[] | null
          ticketmaster_id: string | null
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
          image_url?: string | null
          price_from?: number | null
          price_to?: number | null
          currency?: string
          tickets_url?: string | null
          status?: EventStatus
          is_featured?: boolean
          tags?: string[] | null
          ticketmaster_id?: string | null
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
          image_url?: string | null
          price_from?: number | null
          price_to?: number | null
          currency?: string
          tickets_url?: string | null
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
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          confirmed?: boolean
          created_at?: string
        }
        Update: {
          confirmed?: boolean
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
          venue_id: string
          venue_name: string
          venue_city: string
          venue_postcode: string
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
