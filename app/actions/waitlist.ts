'use server'

import { createClient } from '@supabase/supabase-js'

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function joinWaitlist(data: {
  email: string
  platforms: string[]
  use_case: string
}) {
  if (!data.email || !data.email.includes('@')) {
    return { error: 'Enter a valid email.' }
  }

  const { error } = await supabase()
    .from('waitlist')
    .insert({
      email: data.email.toLowerCase().trim(),
      platforms: data.platforms,
      use_case: data.use_case || null,
    })

  if (error) {
    if (error.code === '23505') return { error: 'already_registered' }
    console.error('Waitlist insert error:', error)
    return { error: 'Something went wrong. Please try again.' }
  }

  return { success: true }
}
