// src/workflows/sync-enviatodo-data.ts
import { 
    createWorkflow,
    WorkflowResponse
  } from "@medusajs/framework/workflows-sdk"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import SkydropxProModuleService from "../modules/skydropxpro/service"
import { SKYDROPPX_MODULE } from "../modules/skydropxpro"

type GetQuotationSkydropxproInput = {
    cart: any
}

const getQuotationSkydropxproStep = createStep(
    "get-quotation-skydropxpro",
    // async (null, { container }) => {
    async (input: GetQuotationSkydropxproInput, { container }) => {
        const skydropxproService: SkydropxProModuleService = container.resolve(SKYDROPPX_MODULE)
        try {
            const zipDetails = await skydropxproService.getZipCodeDetails(input.cart.shipping_address.postal_code)
            if (!zipDetails) {
                return new StepResponse({success: false, quotation: null})
            }
            const quotation = await skydropxproService.calculateShippingRates(input.cart, zipDetails) as any
            if (!quotation) {
                return new StepResponse({success: false, quotation: null})
            } else {
                return new StepResponse({success: true, quotation: quotation})
            }
        } catch (error) {
            console.error("Error in syncEnviatodoParcelsStep ", error)
            return new StepResponse({success: false, quotation: null})
        }
    }
)

export const getQuotationSkydropxproWorkflow = createWorkflow(
    "get-quotation-skydropxpro",
    (input: GetQuotationSkydropxproInput) => {
      const quotationResult = getQuotationSkydropxproStep(input)
      
      return new WorkflowResponse({ 
        success: quotationResult.success, 
        quotation: quotationResult.quotation 
      })
    }
  )