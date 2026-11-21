-- Break the self-referential conversation_participants SELECT policy.
-- The private SECURITY DEFINER helper reads only membership for auth.uid().
CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_conversation_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants AS cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = (SELECT auth.uid())
  );
$$;

ALTER FUNCTION private.is_conversation_participant(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_conversation_participant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_conversation_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "Participants can view conversation members"
ON public.conversation_participants;

CREATE POLICY "Participants can view conversation members"
ON public.conversation_participants
FOR SELECT
TO authenticated
USING ((SELECT private.is_conversation_participant(conversation_id)));
