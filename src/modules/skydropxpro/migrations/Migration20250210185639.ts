import { Migration } from '@mikro-orm/migrations';

export class Migration20250210185639 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "skydropx_parcel" ("id" text not null, "trade_name" text null, "source" text null, "status" text null, "provider_config" jsonb null, "provider_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "skydropx_parcel_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_skydropx_parcel_deleted_at" ON "skydropx_parcel" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "skydropx_parcel_service" ("id" text not null, "provider_service_id" text null, "label" text null, "via_transport" text null, "config" jsonb null, "provider_id" text not null, "parcel_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "skydropx_parcel_service_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_skydropx_parcel_service_parcel_id" ON "skydropx_parcel_service" (parcel_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_skydropx_parcel_service_deleted_at" ON "skydropx_parcel_service" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "skydropx_parcel_service" add constraint "skydropx_parcel_service_parcel_id_foreign" foreign key ("parcel_id") references "skydropx_parcel" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "skydropx_parcel_service" drop constraint if exists "skydropx_parcel_service_parcel_id_foreign";`);

    this.addSql(`drop table if exists "skydropx_parcel" cascade;`);

    this.addSql(`drop table if exists "skydropx_parcel_service" cascade;`);
  }

}
