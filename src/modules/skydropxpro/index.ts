import SkydropxProService from "./service"
import { Module } from "@medusajs/framework/utils"

export const SKYDROPPX_MODULE = "skydropx"

export default Module(SKYDROPPX_MODULE, {
  service: SkydropxProService,
})