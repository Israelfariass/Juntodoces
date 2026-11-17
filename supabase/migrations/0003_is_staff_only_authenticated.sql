-- Só usuários logados precisam chamar is_staff() (as regras da equipe valem só para "authenticated").
revoke execute on function public.is_staff() from anon;
