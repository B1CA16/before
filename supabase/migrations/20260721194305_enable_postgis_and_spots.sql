create extension if not exists postgis;

create table spots (
    id              bigint generated always as identity primary key,
    slug            text not null unique,
    name            text not null,
    region          text not null,
    latitude        double precision not null,
    longitude       double precision not null,
    geom geometry(Point, 4326) generated always as
        (st_setsrid(st_makepoint(longitude, latitude), 4326)) stored,
    orientation_deg real,
    break_type      text check (break_type in ('beach', 'point', 'reef')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index spots_geom_gist on spots using gist (geom);
create index spots_region_idx on spots (region);
