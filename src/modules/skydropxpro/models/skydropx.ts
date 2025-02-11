import { model } from "@medusajs/framework/utils"
export const Parcel = model.define("skydropx_parcel", {
    id: model.id().primaryKey(),
    trade_name: model.text().nullable(),
    source: model.text().nullable(),
    status: model.text().nullable(),
    provider_config: model.json().nullable(),
    provider_id: model.text(),
    services: model.hasMany(() => ParcelService, {
      mappedBy: "parcel"
    })
  })

  export const ParcelService = model.define("skydropx_parcel_service", {
    id: model.id().primaryKey(),
    provider_service_id: model.text().nullable(),
    label: model.text().nullable(),
    via_transport: model.text().nullable(),
    config: model.json().nullable(), // Made optional,
    provider_id: model.text(),
    parcel: model.belongsTo(() => Parcel, {
      foreignKey: "provider_id",
      targetKey: "provider_id"
    })
  })