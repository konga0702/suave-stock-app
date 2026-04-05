import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Only POST is allowed' },
      },
      405
    )
  }

  const expectedToken = Deno.env.get('SYNC_API_TOKEN')
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!expectedToken || bearer !== expectedToken) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing Bearer token' },
      },
      401
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be JSON' },
      },
      400
    )
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be a JSON object' },
      },
      400
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        },
      },
      500
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase.rpc('sync_inventory_transaction', {
    p_payload: payload,
  })

  if (error) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: error.message },
      },
      500
    )
  }

  const result = data as {
    ok?: boolean
    error?: { code?: string; message?: string }
    created?: boolean
  }

  if (!result || typeof result !== 'object') {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Empty RPC response' },
      },
      500
    )
  }

  if (result.ok === false) {
    const code = result.error?.code ?? 'VALIDATION_ERROR'
    const status =
      code === 'INTERNAL_ERROR'
        ? 500
        : code === 'DUPLICATE_EVENT'
          ? 409
          : 400
    return jsonResponse(result, status)
  }

  return jsonResponse(result, 200)
})
