create table conditions (
    id            bigint generated always as identity primary key,
    spot_id       bigint not null references spots(id) on delete cascade,
    observed_at   timestamptz not null,
    source        text not null check (source in ('forecast', 'archive')),

    wave_height_m       real,
    wave_period_s       real,
    wave_direction_deg  real,
    swell_height_m      real,
    swell_period_s      real,
    swell_direction_deg real,
    wind_speed_kmh      real,
    wind_direction_deg  real,
    water_temp_c        real,
    air_temp_c          real,

    fetched_at    timestamptz not null default now(),
    unique (spot_id, observed_at, source)
);

create index conditions_spot_time_idx on conditions (spot_id, observed_at);

alter table conditions enable row level security;
