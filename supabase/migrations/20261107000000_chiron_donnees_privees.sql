-- Données de Chiron : invisibles pour les rôles publics de Supabase.
--
-- Supabase donne par défaut aux rôles `anon` (visiteur) et `authenticated`
-- (utilisateur connecté) tous les droits sur les tables créées dans `public`.
-- Combiné à la clé « anon » publiée dans le frontend, cela permettrait à
-- n'importe qui de lire les dossiers patients sans passer par le backend.
--
-- Chiron n'utilise Supabase QUE pour l'authentification : les tables métier
-- sont créées par Alembic (rôle `postgres`) et ne sont lues que par le
-- backend FastAPI. On retire donc ces droits par défaut, AVANT qu'Alembic ne
-- crée les tables (les migrations Supabase s'exécutent au `supabase start`).
--
-- Défense en profondeur : l'API REST n'expose aucun schéma (config.toml,
-- [api] schemas = []), et Alembic active RLS sur chaque table métier.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Tables éventuellement déjà présentes (base migrée depuis l'ancien PostgreSQL).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
