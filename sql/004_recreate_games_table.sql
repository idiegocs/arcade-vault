-- Recrea `games` como catálogo real (spec 06): id de texto (slug), igual al
-- ya usado en rutas y en scores.game_id. La tabla original de sql/001
-- (BIGINT, vacía, sin uso en el código) se dropea.
drop table if exists games;

create table games (
  id text primary key,
  title text not null,
  short text not null,
  long text not null,
  cat text not null check (cat in ('ARCADE', 'PUZZLE', 'SHOOTER', 'VERSUS')),
  cover text not null,
  color text not null check (color in ('cyan', 'magenta', 'yellow', 'green')),
  sort_order integer not null,
  created_at timestamptz not null default now()
);

alter table games enable row level security;

-- Solo lectura desde la app: select público, sin insert/update/delete.
-- El catálogo se edita a mano (Studio/SQL/MCP), no desde la UI (spec 06).
create policy "games_select_public" on games for select using (true);

insert into
  games (
    id,
    title,
    short,
    long,
    cat,
    cover,
    color,
    sort_order
  )
values
  (
    'bloque-buster',
    'BLOQUE BUSTER',
    'Rebota la pelota y destruye muros de neón.',
    'Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?',
    'ARCADE',
    'cover-bricks',
    'cyan',
    1
  ),
  (
    'caida',
    'CAÍDA',
    'Encaja las piezas antes de que el techo te aplaste.',
    'Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.',
    'PUZZLE',
    'cover-tetro',
    'magenta',
    2
  ),
  (
    'serpentina',
    'SERPENTINA',
    'Crece sin morder tu propia cola.',
    'Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.',
    'ARCADE',
    'cover-snake',
    'green',
    3
  ),
  (
    'gloton',
    'GLOTÓN',
    'Devora puntos y escapa de los fantasmas.',
    'Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.',
    'ARCADE',
    'cover-glot',
    'yellow',
    4
  ),
  (
    'invasores',
    'INVASORES',
    'Defiende el planeta de filas alienígenas.',
    'Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.',
    'SHOOTER',
    'cover-invaders',
    'green',
    5
  ),
  (
    'rocas',
    'ROCAS',
    'Pulveriza asteroides en gravedad cero.',
    'Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.',
    'SHOOTER',
    'cover-rocas',
    'yellow',
    6
  ),
  (
    'ranaria',
    'RANARIA',
    'Cruza la autopista de pixeles.',
    'Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.',
    'ARCADE',
    'cover-rana',
    'green',
    7
  ),
  (
    'duelo-pixel',
    'DUELO PIXEL',
    'Dos paletas. Una pelota. Reflejos máximos.',
    'El duelo más puro: dos paletas verticales se enfrentan por rebotar una pelota luminosa. Modo solitario contra la CPU o partida local a dos jugadores.',
    'VERSUS',
    'cover-duelo',
    'cyan',
    8
  );

-- Ahora que `games` es la fuente de verdad del catálogo, se liga `scores`
-- a ella con una FK real (revierte la decisión de spec 04 de no acoplarlas).
alter table scores
add constraint scores_game_id_fkey foreign key (game_id) references games (id);
