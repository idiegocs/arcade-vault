-- scores: histórico de puntajes por usuario y juego (append-only)
CREATE TABLE public.scores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL, -- coincide con Game.id de lib/data.ts, sin FK a la tabla `games`
    score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scores_game_id_score_idx ON public.scores (game_id, score DESC);

ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scores are viewable by everyone"
    ON public.scores FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own scores"
    ON public.scores FOR INSERT
    WITH CHECK (auth.uid() = user_id);
