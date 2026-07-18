import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) console.error('Error fetching profile from DB:', error)

      if (data) {
        setProfile(data)
      } else {
        // Self-healing: if profile doesn't exist, create it from auth session metadata
        const { data: { session } } = await supabase.auth.getSession()
        const authUser = session?.user
        const meta = authUser?.user_metadata
        
        // Mapeo inteligente para Google OAuth y Email/Password
        const firstName = meta?.first_name || 
                          meta?.given_name || 
                          meta?.full_name?.split(' ')[0] || 
                          authUser?.email?.split('@')[0] || 
                          'Usuario';
        const lastName = meta?.last_name || 
                         meta?.family_name || 
                         meta?.full_name?.split(' ').slice(1).join(' ') || 
                         '';

        const newProfile = {
          id: userId,
          first_name: firstName,
          last_name: lastName,
          timezone: 'UTC'
        }
        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .maybeSingle()

        if (!insertErr && inserted) {
          setProfile(inserted)
        } else {
          console.error('Error creating self-healing profile:', insertErr)
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }


  async function signUp({ email, password, firstName, lastName }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    })
    if (error) throw error
    return data
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    })
    if (error) throw error
    return data
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/auth?mode=update-password'
    })
    if (error) throw error
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, signUp, signIn, signInWithGoogle, 
      resetPassword, updatePassword, signOut, updateProfile 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
