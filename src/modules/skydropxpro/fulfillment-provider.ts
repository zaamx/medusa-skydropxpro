import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import {
  CalculateShippingOptionPriceDTO,
  CalculatedShippingOptionPrice,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"

import SkydropxProService, {
  SkydropxCalculatedRate,
  SkydropxProServiceOptions,
  SkydropxShipmentResponse,
  SkydropxWarehouseRates,
} from "./service"

type InjectedDependencies = {
  logger: Logger
}

type SkydropxFulfillmentProviderOptions = SkydropxProServiceOptions & {
  default_strategy?: "cheapest" | "fastest"
}

type SelectedRateInput = {
  warehouse_id: string
  rate_id: string
}

type SelectedRate = {
  warehouse_id: string
  rate: SkydropxCalculatedRate
}

type SkydropxFulfillmentContext =
  | ValidateFulfillmentDataContext
  | CalculateShippingOptionPriceDTO["context"]

export const PROVIDER_IDENTIFIER = "skydropxpro"
const DEFAULT_OPTION_ID = `${PROVIDER_IDENTIFIER}_dynamic`

class SkydropxFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = PROVIDER_IDENTIFIER

  protected logger_: Logger
  protected options_: SkydropxFulfillmentProviderOptions
  protected skydropxService_: SkydropxProService

  constructor(
    { logger }: InjectedDependencies,
    _options: SkydropxFulfillmentProviderOptions =
      {} as SkydropxFulfillmentProviderOptions
  ) {
    super()

    if (!logger) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Skydropx fulfillment provider requires a logger instance"
      )
    }

    this.logger_ = logger
    this.options_ = _options

    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Skydropx fulfillment provider is disabled. Use the Skydropx workflows instead."
    )
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: DEFAULT_OPTION_ID,
        name: "Skydropx (calculated)",
        is_return: false,
      },
    ]
  }

  async validateOption(): Promise<boolean> {
    return true
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const selectedRatesInput = this.normaliseSelectedRatesInput(data)
    const warehouseRates = await this.fetchWarehouseRates(context)
    const { selections, totalAmount } = this.selectRates(
      warehouseRates,
      selectedRatesInput
    )

    if (!selections.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No valid Skydropx rates were found for the provided cart"
      )
    }

    return {
      calculated_amount: totalAmount,
      is_calculated_price_tax_inclusive: false,
    }
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext
  ): Promise<any> {
    const selectedRatesInput = this.normaliseSelectedRatesInput(data)
    const warehouseRates = await this.fetchWarehouseRates(context)
    const { selections, totalAmount } = this.selectRates(
      warehouseRates,
      selectedRatesInput
    )

    if (!selections.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Skydropx could not determine a rate for this address"
      )
    }

    const selectedRates = selections.map((selection) => ({
      warehouse_id: selection.warehouse_id,
      rate_id: selection.rate.metadata.id,
      rate: selection.rate,
    }))

    return {
      ...data,
      selected_rates: selectedRates,
      last_calculated_amount: totalAmount,
      available_rates: warehouseRates,
    }
  }

  async createFulfillment(
    data: Record<string, unknown>,
    _items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    if (!order?.shipping_address?.postal_code) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order shipping address is required to create a Skydropx fulfillment"
      )
    }

    const selectedRates = Array.isArray(data?.selected_rates)
      ? (data.selected_rates as SelectedRate[])
      : []

    if (!selectedRates.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No Skydropx rate was stored on the shipping method"
      )
    }

    const zipDetails = await this.skydropxService_.getZipCodeDetails(
      order.shipping_address.postal_code as string
    )

    if (!zipDetails) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unable to resolve destination postal code for Skydropx"
      )
    }

    const shipments: Array<{
      warehouse_id: string
      result: SkydropxShipmentResponse
    }> = []
    for (const selection of selectedRates) {
      const shipmentResult = await this.skydropxService_.createShipment(
        order,
        zipDetails,
        fulfillment,
        selection.warehouse_id,
        selection.rate
      )

      shipments.push({
        warehouse_id: selection.warehouse_id,
        result: shipmentResult,
      })
    }

    return {
      data: {
        selected_rates: selectedRates,
        shipments,
      },
      labels: [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    const shipments = Array.isArray(data?.shipments)
      ? (data.shipments as Array<{
          warehouse_id: string
          result: SkydropxShipmentResponse
        }> )
      : []

    await Promise.all(
      shipments.map(async ({ result }) => {
        const shipmentId = result?.shipment?.data?.id

        if (!shipmentId) {
          return
        }

        try {
          await this.skydropxService_.cancelShipment(
            shipmentId,
            "Cancelled from Medusa fulfillment"
          )
        } catch (error) {
          this.logger_.error(
            `Failed to cancel Skydropx shipment ${shipmentId}: ${error}`
          )
        }
      })
    )
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Skydropx return fulfillments are not supported"
    )
  }

  async retrieveDocuments(): Promise<void> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Skydropx document retrieval is not implemented"
    )
  }

  private normaliseSelectedRatesInput(
    data: Record<string, unknown>
  ): SelectedRateInput[] {
    if (!data?.selected_rates) {
      return []
    }

    const raw = data.selected_rates

    if (Array.isArray(raw)) {
      return raw
        .map((entry) => {
          if (
            entry &&
            typeof entry === "object" &&
            "warehouse_id" in entry &&
            "rate_id" in entry
          ) {
            return {
              warehouse_id: String((entry as any).warehouse_id),
              rate_id: String((entry as any).rate_id),
            }
          }

          return null
        })
        .filter((entry): entry is SelectedRateInput => Boolean(entry))
    }

    if (
      typeof raw === "object" &&
      raw !== null &&
      "warehouse_id" in raw &&
      "rate_id" in raw
    ) {
      return [
        {
          warehouse_id: String((raw as any).warehouse_id),
          rate_id: String((raw as any).rate_id),
        },
      ]
    }

    return []
  }

  private async fetchWarehouseRates(
    context: SkydropxFulfillmentContext
  ): Promise<SkydropxWarehouseRates[]> {
    const postalCode = context.shipping_address?.postal_code

    if (!postalCode) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A shipping address postal code is required to calculate Skydropx rates"
      )
    }

    const zipDetails = await this.skydropxService_.getZipCodeDetails(postalCode)

    if (!zipDetails) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Skydropx could not resolve the destination postal code"
      )
    }

    return this.skydropxService_.calculateShippingRates(context, zipDetails)
  }

  private selectRates(
    warehouseRates: SkydropxWarehouseRates[],
    requested: SelectedRateInput[]
  ): { selections: SelectedRate[]; totalAmount: number } {
    const defaultStrategy = this.options_?.default_strategy ?? "cheapest"
    const selections: SelectedRate[] = []

    warehouseRates.forEach(({ warehouse_id, rates }) => {
      if (!rates?.length) {
        return
      }

      const requestedRateId = requested.find(
        (entry) => entry.warehouse_id === warehouse_id
      )?.rate_id

      let selectedRate: SkydropxCalculatedRate | undefined

      if (requestedRateId) {
        selectedRate = rates.find(
          (rate) => rate.metadata?.id === requestedRateId
        )
      }

      if (!selectedRate) {
        selectedRate = this.pickFallbackRate(rates, defaultStrategy)
      }

      if (!selectedRate) {
        return
      }

      selections.push({
        warehouse_id,
        rate: selectedRate,
      })
    })

    const totalAmount = selections.reduce(
      (sum, { rate }) => sum + (Number.isFinite(rate.price) ? rate.price : 0),
      0
    )

    return { selections, totalAmount }
  }

  private pickFallbackRate(
    rates: SkydropxCalculatedRate[],
    strategy: "cheapest" | "fastest"
  ): SkydropxCalculatedRate | undefined {
    if (!rates.length) {
      return undefined
    }

    if (strategy === "fastest") {
      const sortedByDays = [...rates].sort((a, b) => {
        const aDays = a.data.estimated_days ?? Number.MAX_SAFE_INTEGER
        const bDays = b.data.estimated_days ?? Number.MAX_SAFE_INTEGER
        return aDays - bDays || a.price - b.price
      })

      return sortedByDays[0]
    }

    const sortedByPrice = [...rates].sort((a, b) => a.price - b.price)
    return sortedByPrice[0]
  }
}

export { SkydropxFulfillmentProviderService }

