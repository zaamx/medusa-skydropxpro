/**
 * SkydropxProService
 * 
 * Operational Flow:
 * 1. Authentication: 
 *    - Authenticates via OAuth (Client Credentials) to obtain an access token.
 * 2. Quotation (Checkout Flow):
 *    - `calculateShippingRates` groups cart items by warehouse.
 *    - Resolves package dimensions via `calculatePackageDetails` (checking Supabase for product specs).
 *    - Resolves origin address via `getOriginAddress` (mapping Medusa Stock Locations).
 *    - Requests quotations from Skydropx and polls for completion.
 * 3. Shipment Creation (Fulfillment Flow):
 *    - `createShipment` is triggered during order fulfillment.
 *    - Validates order items, calculates declared value, and confirms addresses.
 *    - Creates a shipment in Skydropx using the selected rate.
 *    - Polls for shipment success status.
 * 4. Management:
 *    - Provides methods for Tracking, Pickup scheduling, Cancellations, and Label generation.
 */
import { MedusaService } from "@medusajs/framework/utils"
import { Parcel, ParcelService } from "./models/skydropx"
import { Logger } from "@medusajs/framework/types"
import axios from "axios"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

export type SkydropxProServiceOptions = {
    apiUrl: string,
    apiKey: string,
    apiSecret: string
}

type StockLocationModuleService = {
    listStockLocations: (
        selector?: Record<string, any>,
        config?: Record<string, any>
    ) => Promise<any[]>
}

type SkydropxOriginAddress = {
    country_code: string
    postal_code: string
    area_level1: string
    area_level2: string
    area_level3: string
    street1: string
    internal_number: string
    reference: string
    name: string
    company: string
    phone: string
    email: string
}

type InjectedDependencies = {
    logger: Logger
}

export type SkydropxRate = {
    success: boolean;
    id: string;
    rate_type: string | null;
    provider_name: string;
    provider_service_name: string;
    provider_service_code: string;
    status: string;
    currency_code: string | null;
    cost: number | null;
    amount: string | null;
    total: string | null;
    days: number | null;
    zone: string | null;
    weight: number;
    insurable: boolean | null;
    has_own_agreement: boolean;
    own_agreement_amount: number | null;
    extra_fees: any[] | null;
    error_messages: any[] | null;
    plan_type: string | null;
    country_code: string | null;
}

export type SkydropxResponse = {
    id: string;
    quotation_scope: {
        found_carriers?: string[];
        carriers_scoped_to: string;
        not_found_carriers?: string[];
    };
    is_completed: boolean;
    rates: SkydropxRate[];
    packages?: any[];
    overweight?: boolean;
}

export type SkydropxShipmentResponse = {
    success: boolean;
    shipment: any;
    rate?: SkydropxCalculatedRate;
}

export type SkydropxCalculatedRate = {
    id: string
    name: string
    price: number
    data: {
        provider_name: string
        provider_service_code: string
        estimated_days: number | null
        currency_code: string | null
        quotation_id: string
        status: string
        cost: number | null
        zone: string | null
        weight: number
        success: boolean
    }
    metadata: SkydropxRate
}

export type SkydropxWarehouseRates = {
    warehouse_id: string
    rates: SkydropxCalculatedRate[]
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials")
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
})

class SkydropxProService extends MedusaService({
    Parcel,
    ParcelService
}) {
    protected readonly options_: SkydropxProServiceOptions
    protected readonly logger_: Logger
    protected stockLocationModuleService_?: StockLocationModuleService

    constructor(
        deps: InjectedDependencies,
        options: SkydropxProServiceOptions
    ) {
        // @ts-ignore
        super(...arguments)
        const { logger } = deps
        this.options_ = options
        this.logger_ = logger
    }

    /**
     * Handles API errors consistently across the service.
     * Logs the error and returns a standardized error object.
     * 
     * @param error - The error object caught from the try/catch block.
     * @param methodName - The name of the method where the error occurred.
     * @returns A standarized error response object.
     */
    private handleApiError(error: any, methodName: string): any {
        const errorMessage = error.response?.data || error.message || error
        this.logger_.error(`[SkydropxProService.${methodName}] Error: ${JSON.stringify(errorMessage)}`)

        // Return appropriate error response based on the method
        return {
            success: false,
            error: errorMessage,
            message: `Failed to ${methodName.replace(/([A-Z])/g, ' $1').toLowerCase()}`
        }
    }

    /**
     * Validates that the necessary configuration options (API Key, Secret, URL) are present.
     * 
     * @returns True if configuration is valid, false otherwise.
     */
    private validateConfig(): boolean {
        if (!this.options_.apiKey || !this.options_.apiSecret || !this.options_.apiUrl) {
            this.logger_.error('[SkydropxProService] Missing required configuration: apiKey, apiSecret, or apiUrl')
            return false
        }
        return true
    }

    /**
     * Extracts the warehouse ID from an item's SKU.
     * Expects SKU format: "SKU||WAREHOUSE_ID".
     * 
     * @param item - The line item to check.
     * @returns The warehouse ID if found, otherwise undefined.
     */
    private getAlmacenIdFromItem(item: any): string | undefined {
        const sku = typeof item?.variant_sku === "string" ? item.variant_sku : undefined

        if (!sku) {
            this.logger_.warn(`[SkydropxProService] Line item ${item?.id ?? "unknown"} missing variant_sku`)
            return undefined
        }

        const [, rawAlmacenId] = sku.split("||")
        const almacenId = rawAlmacenId?.trim()

        if (!almacenId) {
            this.logger_.warn(`[SkydropxProService] Line item ${item?.id ?? "unknown"} variant_sku ${sku} missing almacen identifier`)
            return undefined
        }

        return almacenId
    }

    /**
     * Builds the default origin address using environment variables.
     * Used as a fallback when no specific warehouse address is found.
     * 
     * @returns The default SkydropxOriginAddress.
     */
    private buildDefaultOriginAddress(): SkydropxOriginAddress {
        const postalCode = String(process.env.STORE_ZIP_CODE ?? "54030").trim()
        if (!postalCode) {
            this.logger_.warn('[SkydropxProService] Empty postal code in origin address, using default')
        }

        const rawStoreName = process.env.STORE_NAME ?? 'Toyota Satelite'
        const trimmedStoreName = typeof rawStoreName === "string" ? rawStoreName.trim() : ''
        if (!trimmedStoreName) {
            this.logger_.warn('[SkydropxProService] Empty store name in origin address, using default')
        }

        const resolvedPostalCode = postalCode || ''
        const normalizedStoreName = trimmedStoreName.includes("||")
            ? trimmedStoreName.split("||").map(segment => segment.trim()).filter(Boolean)[0] || trimmedStoreName
            : trimmedStoreName

        return {
            country_code: "MX",
            postal_code: resolvedPostalCode,
            area_level1: process.env.STORE_STATE || 'N/A',
            area_level2: process.env.STORE_MUNICIPALITY || 'N/A',
            area_level3: process.env.STORE_SUBURB || 'N/A',
            street1: process.env.STORE_ADDRESS || '',
            internal_number: process.env.STORE_EXT_NUMBER || '',
            reference: process.env.STORE_REFERENCE || '',
            name: normalizedStoreName,
            company: normalizedStoreName,
            phone: process.env.STORE_PHONE || '',
            email: process.env.STORE_EMAIL || 'soporte@ballena.com.mx'
        }
    }

    /**
     * Maps a Medusa Stock Location to a Skydropx Origin Address.
     * 
     * @param stockLocation - The source stock location from Medusa.
     * @param fallback - The fallback address to use for missing fields.
     * @returns The mapped SkydropxOriginAddress.
     */
    private mapStockLocationToOriginAddress(
        stockLocation: any,
        fallback: SkydropxOriginAddress
    ): SkydropxOriginAddress {
        if (!stockLocation) {
            return fallback
        }

        const address = stockLocation.address ?? {}
        const metadata = stockLocation.metadata ?? {}

        const countryCode = typeof address.country_code === "string" && address.country_code.trim()
            ? address.country_code.trim()
            : fallback.country_code

        const postalCode = typeof address.postal_code === "string" && address.postal_code.trim()
            ? address.postal_code.trim()
            : fallback.postal_code

        const province = typeof address.province === "string" && address.province.trim()
            ? address.province.trim()
            : typeof address.state === "string" && address.state.trim()
                ? address.state.trim()
                : fallback.area_level1 || "N/A"

        const city = typeof address.city === "string" && address.city.trim()
            ? address.city.trim()
            : fallback.area_level2 || "N/A"

        const district = typeof address.district === "string" && address.district.trim()
            ? address.district.trim()
            : fallback.area_level3 || "N/A"

        const street1 = typeof address.address_1 === "string" && address.address_1.trim()
            ? address.address_1.trim()
            : fallback.street1

        const address2 = typeof address.address_2 === "string" && address.address_2.trim()
            ? address.address_2.trim()
            : ''

        const metadataAreaLevel3 = typeof metadata.area_level3 === "string" && metadata.area_level3.trim()
            ? metadata.area_level3.trim()
            : undefined

        const metadataInternalNumber = typeof metadata.internal_number === "string" && metadata.internal_number.trim()
            ? metadata.internal_number.trim()
            : undefined

        const metadataReference = typeof metadata.reference === "string" && metadata.reference.trim()
            ? metadata.reference.trim()
            : undefined

        const metadataPhone = typeof metadata.phone === "string" && metadata.phone.trim()
            ? metadata.phone.trim()
            : undefined

        const metadataEmail = typeof metadata.email === "string" && metadata.email.trim()
            ? metadata.email.trim()
            : undefined

        const metadataCompany = typeof metadata.company === "string" && metadata.company.trim()
            ? metadata.company.trim()
            : undefined

        const rawName = typeof stockLocation.name === "string" ? stockLocation.name.trim() : ""
        const strippedName = rawName.includes("||")
            ? rawName.split("||").map(segment => segment.trim()).filter(Boolean)[0] || rawName
            : rawName
        const name = strippedName || fallback.name

        const internalNumber = metadataInternalNumber || address2 || fallback.internal_number
        const reference =
            metadataReference ||
            [street1].filter(Boolean).join(" ").trim() ||
            fallback.reference

        const phone = metadataPhone ||
            (typeof address.phone === "string" && address.phone.trim() ? address.phone.trim() : undefined) ||
            fallback.phone

        return {
            country_code: countryCode,
            postal_code: postalCode,
            area_level1: province,
            area_level2: city,
            area_level3: metadataAreaLevel3 || district,
            street1,
            internal_number: internalNumber,
            reference: reference.slice(0, 30),
            name,
            company: metadataCompany || name || fallback.company,
            phone,
            email: metadataEmail || fallback.email || 'soporte@ballena.com.mx'
        }
    }

    /**
     * Injects the Stock Location Module Service.
     * This service is required to resolve warehouse addresses.
     * 
     * @param service - The StockLocationModuleService instance.
     */
    setStockLocationModuleService(service?: StockLocationModuleService) {
        this.stockLocationModuleService_ = service
    }

    /**
     * Authenticates with Skydropx API using Client Credentials.
     * 
     * @returns The access token string or null if authentication fails.
     */
    async authenticate() {
        if (!this.validateConfig()) {
            return null
        }

        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.options_.apiKey,
            client_secret: this.options_.apiSecret
        })

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: this.options_.apiUrl + "/oauth/token",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            data: body.toString()
        }

        try {
            const response = await axios.request(config)
            const token = response.data?.access_token

            if (typeof token !== 'string' || token.length === 0) {
                this.logger_.error('[SkydropxProService.authenticate] Missing access_token in response')
                return null
            }

            return token
        } catch (error) {
            return this.handleApiError(error, 'authenticate')
        }
    }

    /**
     * Creates a new quotation request in Skydropx.
     * 
     * @param data - The I/O data for the quotation (origin, destination, package).
     * @returns The quotation response object.
     */
    async getQuotations(data: any) {
        const token = await this.authenticate()

        if (!token || typeof token !== 'string') {
            this.logger_.error(`[SkydropxProService.getQuotations] Invalid token received: ${JSON.stringify(token)}`)
            return this.handleApiError({ message: 'Authentication failed' }, 'getQuotations')
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/quotations", data, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })

            // Ensure we return a proper structure
            if (response.data && typeof response.data === 'object') {
                return response.data
            } else {
                this.logger_.error('[SkydropxProService] Invalid response structure from getQuotations')
                return { error: 'Invalid response structure' }
            }
        } catch (error) {
            return this.handleApiError(error, 'getQuotations')
        }
    }

    /**
     * Retrieves a specific quotation by its ID.
     * Useful for polling incomplete quotations.
     * 
     * @param id - The quotation ID.
     * @returns The quotation details.
     */
    async getQuotationById(id: string) {
        const token = await this.authenticate()
        if (!token || typeof token !== 'string') {
            this.logger_.error(`[SkydropxProService.getQuotationById] Invalid token received: ${JSON.stringify(token)}`)
            return this.handleApiError({ message: 'Authentication failed' }, 'getQuotationById')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/quotations/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })

            // Ensure we return a proper structure
            if (response.data && typeof response.data === 'object') {
                return response.data
            } else {
                this.logger_.error('[SkydropxProService] Invalid response structure from getQuotationById')
                return { error: 'Invalid response structure' }
            }
        } catch (error) {
            return this.handleApiError(error, 'getQuotationById')
        }
    }

    /**
     * Placeholder for ZIP code details retrieval.
     */
    async getZipCodeDetails(postcode: string) {
        /* TODO: Implement this */
        return postcode
    }

    /**
     * Placeholder for client balance retrieval.
     */
    async getClientBalance() {
        /* TODO: Implement this */
        return 0
    }

    /**
     * Normalises SKU by removing the warehouse identifier.
     * 
     * @param rawSku - The raw SKU string.
     * @returns The clean SKU.
     */
    private normaliseSku(rawSku: string | undefined): string | undefined {
        if (!rawSku || typeof rawSku !== "string") {
            return undefined
        }

        const [skuPart] = rawSku.split("||")
        const trimmed = skuPart?.trim()
        return trimmed && trimmed.length > 0 ? trimmed : undefined
    }

    /**
     * Calculates the total weight and dimensions for a set of items.
     * Fetches product dimensions from Supabase 'productos' table if available.
     * 
     * @param items - List of items to calculate.
     * @returns Object containing length, width, height, and weight.
     */
    async calculatePackageDetails(items: any) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            this.logger_.warn('[SkydropxProService] No items provided for package calculation')
            return {
                length: 10,
                width: 10,
                height: 10,
                weight: 1
            }
        }
        console.log('items', items)

        const uniqueSkus = Array.from(
            new Set(
                items
                    .map((item) =>
                        this.normaliseSku(
                            item.variant_sku ||
                            item.variant?.sku ||
                            item.variant?.product?.sku
                        )
                    )
                    .filter((sku): sku is string => Boolean(sku))
            )
        )

        let productosMap: Record<string, { alto?: number; ancho?: number; largo?: number; peso?: number }> = {}
        if (uniqueSkus.length > 0) {
            try {
                const { data, error } = await supabase
                    .from('productos')
                    .select('sku, alto, ancho, largo, peso')
                    .in('sku', uniqueSkus)

                if (error) {
                    this.logger_.warn(`[SkydropxProService] Failed to fetch product dimensions from Supabase: ${error.message}`)
                } else if (Array.isArray(data)) {
                    productosMap = data.reduce<Record<string, { alto?: number; ancho?: number; largo?: number; peso?: number }>>((acc, producto) => {
                        const sku = typeof producto?.sku === "string" ? producto.sku.trim() : undefined
                        if (!sku) {
                            return acc
                        }

                        acc[sku] = {
                            alto: typeof producto.alto === "number" ? producto.alto : undefined,
                            ancho: typeof producto.ancho === "number" ? producto.ancho : undefined,
                            largo: typeof producto.largo === "number" ? producto.largo : undefined,
                            peso: typeof producto.peso === "number" ? producto.peso : undefined,
                        }

                        return acc
                    }, {})
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
                this.logger_.warn(`[SkydropxProService] Unexpected error fetching product dimensions from Supabase: ${errorMessage}`)
            }
        }

        let totalWeight = 0
        let maxDimensions = { length: 0, width: 0, height: 0 }

        items.forEach(item => {
            const quantity = item.quantity || 1
            const sku = this.normaliseSku(
                item.variant_sku ||
                item.variant?.sku ||
                item.variant?.product?.sku
            )
            const producto = sku ? productosMap[sku] : undefined

            const variantWeight = typeof item.variant?.weight === "number" ? item.variant.weight : undefined
            const productWeight = typeof producto?.peso === "number" ? producto.peso : undefined

            const itemWeight = productWeight && productWeight > 0
                ? productWeight
                : variantWeight && variantWeight > 0
                    ? variantWeight
                    : 1

            totalWeight += itemWeight * quantity

            const dimensionLength = producto?.largo && producto.largo > 0
                ? producto.largo
                : typeof item.variant?.length === "number" && item.variant.length > 0
                    ? item.variant.length
                    : 10

            const dimensionWidth = producto?.ancho && producto.ancho > 0
                ? producto.ancho
                : typeof item.variant?.width === "number" && item.variant.width > 0
                    ? item.variant.width
                    : 10

            const dimensionHeight = producto?.alto && producto.alto > 0
                ? producto.alto
                : typeof item.variant?.height === "number" && item.variant.height > 0
                    ? item.variant.height
                    : 10

            maxDimensions.length = Math.max(maxDimensions.length, dimensionLength * quantity)
            maxDimensions.width = Math.max(maxDimensions.width, dimensionWidth * quantity)
            maxDimensions.height = Math.max(maxDimensions.height, dimensionHeight * quantity)
        })

        const minWeight = 0.01; // 10g minimum to avoid zero-weight packages
        const maxWeight = 500; // 500kg maximum for automotive parts (engines, transmissions, etc.)

        // Ensure minimum values and validate
        const packageDetails = {
            length: Math.max(maxDimensions.length, 1),
            width: Math.max(maxDimensions.width, 1),
            height: Math.max(maxDimensions.height, 1),
            weight: Math.max(Math.min(totalWeight, maxWeight), minWeight)
        }

        this.logger_.info(`[SkydropxProService] Calculated package details: ${JSON.stringify(packageDetails)}`)

        return packageDetails
    }

    /**
     * Resolves the origin address for a specific warehouse ID.
     * Attempts to find a matching Stock Location in Medusa.
     * 
     * @param almacenId - The warehouse identifier.
     * @returns The resolved SkydropxOriginAddress.
     */
    async getOriginAddress(almacenId?: string): Promise<SkydropxOriginAddress> {
        const defaultAddress = this.buildDefaultOriginAddress()

        const normalizedAlmacenId = typeof almacenId === "string" ? almacenId.trim() : undefined
        if (!normalizedAlmacenId || normalizedAlmacenId === "") {
            this.logger_.debug('[SkydropxProService] Using default origin address because no almacen identifier was provided')
            return defaultAddress
        }

        if (normalizedAlmacenId === "default") {
            this.logger_.debug('[SkydropxProService] Using default origin address for warehouse "default"')
            return defaultAddress
        }

        const moduleService = this.stockLocationModuleService_
        if (!moduleService?.listStockLocations) {
            this.logger_.warn(`[SkydropxProService] Stock location module service unavailable when resolving almacen ${normalizedAlmacenId}`)
            return defaultAddress
        }

        const selectors: Array<{ selector: Record<string, any>; debugLabel: string }> = [
            { selector: { metadata: { almacen_id_unico: normalizedAlmacenId } }, debugLabel: "metadata.almacen_id_unico" },
            { selector: { metadata: { almacen_id: normalizedAlmacenId } }, debugLabel: "metadata.almacen_id" },
            { selector: { metadata: { almacen: normalizedAlmacenId } }, debugLabel: "metadata.almacen" },
            { selector: { id: [normalizedAlmacenId] }, debugLabel: "id" },
            { selector: { q: normalizedAlmacenId }, debugLabel: "search" },
        ]

        for (const { selector, debugLabel } of selectors) {
            try {
                const locations = await moduleService.listStockLocations(selector, {
                    relations: ["address"],
                    take: 5
                })

                if (!Array.isArray(locations) || !locations.length) {
                    continue
                }

                const matchedLocation = locations.find((location: any) => {
                    const locationMetadata = location?.metadata ?? {}
                    const locationName = typeof location?.name === "string" ? location.name : ""
                    const nameSegments = locationName
                        .split("||")
                        .map((segment: string) => segment.trim())
                        .filter(Boolean)
                    const normalizedTarget = normalizedAlmacenId.toLowerCase()
                    const matchesNameSegment = nameSegments.some(
                        (segment: string) => segment.toLowerCase() === normalizedTarget
                    )
                    const matchesExactName = locationName.trim().toLowerCase() === normalizedTarget
                    const matchesMetadata = [
                        locationMetadata?.almacen_id_unico,
                        locationMetadata?.almacen_id,
                        locationMetadata?.almacen,
                    ]
                        .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : undefined))
                        .some((value) => value === normalizedTarget)

                    return (
                        (typeof location?.id === "string" && location.id.trim() === normalizedAlmacenId) ||
                        matchesExactName ||
                        matchesNameSegment ||
                        matchesMetadata
                    )
                }) ?? locations[0]

                if (matchedLocation) {
                    this.logger_.info(`[SkydropxProService] Resolved almacen ${normalizedAlmacenId} to stock location ${matchedLocation.id ?? matchedLocation.name ?? "unknown"} via ${debugLabel}`)
                    return this.mapStockLocationToOriginAddress(matchedLocation, defaultAddress)
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
                this.logger_.warn(`[SkydropxProService] Failed to query stock locations by ${debugLabel} for almacen ${normalizedAlmacenId}: ${errorMessage}`)
            }
        }

        this.logger_.warn(`[SkydropxProService] No stock location found for almacen ${normalizedAlmacenId}, falling back to default origin address`)
        return defaultAddress
    }

    /**
     * Extracts and processes the destination address from the cart.
     * 
     * @param cart - The shopping cart object containing the shipping address.
     * @param zipDetails - (Optional) Additional zip code details.
     * @returns The formatted destination address or null if invalid.
     */
    getDestinationAddress(cart: any, zipDetails: any) {
        if (!cart?.shipping_address) {
            this.logger_.warn('[SkydropxProService] No shipping address provided')
            return null
        }

        const address = cart.shipping_address
        const postalCode = String(zipDetails?.replace(/\D/g, '') || '00000').trim()
        if (!postalCode || postalCode === '') {
            this.logger_.warn('[SkydropxProService] Empty postal code in destination address, using default')
        }

        const customerName = `${address.first_name || 'N/A'} ${address.last_name || 'N/A'}`.trim()
        if (customerName === 'N/A N/A' || customerName === '') {
            this.logger_.warn('[SkydropxProService] Empty customer name in destination address, using default')
        }

        return {
            country_code: "MX",
            postal_code: postalCode || '00000',
            area_level1: address.province || 'N/A',
            area_level2: address.city || 'N/A',
            area_level3: address.district || 'N/A',
            street1: address.address_1 || 'N/A',
            internal_number: address.address_2 || '1',
            reference: (address.address_1) || 'N/A',
            name: customerName || 'Customer Name',
            company: address.company || '',
            phone: address.phone || '0',
            email: cart.email || 'n/a@example.com'
        }
    }

    /**
     * Main method to calculate shipping rates for a cart.
     * Groups items by warehouse, requests quotations for each group, and returns aggregated rates.
     * 
     * Operational Flow:
     * 1. Groups cart items by their assigned warehouse (using SKU identifier).
     * 2. Iterates over each warehouse group to calculate independent shipping rates.
     * 3. For each group:
     *    - Calculates package dimensions and weight.
     *    - Resolves origin and destination addresses.
     *    - Requests a quotation from Skydropx API.
     *    - **Polling Mechanism**: If the initial quotation response has `is_completed: false`, 
     *      it enters a polling loop with exponential backoff (starting at 1s) to wait for 
     *      the quotation to complete (up to 5 attempts). This ensures rates are fully generated 
     *      before returning.
     *    - Filters valid rates (valid price, valid days, applicable status).
     *    - Maps internal rates to Medusa-compatible structure.
     * 
     * @param cart - The user's cart containing items and shipping address.
     * @param zipDetails - Additional zip context for destination validation.
     * @returns Array of rates grouped by warehouse.
     */
    async calculateShippingRates(cart: any, zipDetails: any): Promise<SkydropxWarehouseRates[]> {
        if (!cart?.items || !Array.isArray(cart.items) || cart.items.length === 0) {
            this.logger_.warn('[SkydropxProService] No cart items provided for rate calculation')
            return []
        }

        // Group items by warehouse
        const warehouseItems = (cart.items as any[]).reduce((acc: Record<string, any[]>, item) => {
            const almacenId = this.getAlmacenIdFromItem(item) || 'default'
            const key = almacenId && almacenId !== '' ? almacenId : 'default'
            if (!acc[key]) {
                acc[key] = []
            }
            acc[key].push(item)
            return acc
        }, {} as Record<string, any[]>)

        // Calculate rates for each warehouse
        const warehouseRates = await Promise.all(
            Object.entries(warehouseItems).map(async ([warehouseId, items]) => {
                const normalizedWarehouseId =
                    typeof warehouseId === "string" && warehouseId.trim()
                        ? warehouseId.trim()
                        : "default"
                try {
                    this.logger_.info(`[SkydropxProService] Processing warehouse ${normalizedWarehouseId} with ${(items as any[]).length} items`)
                    const packageDetails = await this.calculatePackageDetails(items)
                    const origin = await this.getOriginAddress(normalizedWarehouseId)
                    const destination = this.getDestinationAddress(cart, zipDetails)

                    if (!destination) {
                        this.logger_.warn(`[SkydropxProService] Invalid destination address for warehouse ${normalizedWarehouseId}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // Validate address data
                    if (!origin.postal_code || !destination.postal_code) {
                        this.logger_.warn(`[SkydropxProService] Missing postal codes for warehouse ${normalizedWarehouseId}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // Validate package details
                    if (!packageDetails || packageDetails.weight <= 0 || packageDetails.length <= 0 || packageDetails.width <= 0 || packageDetails.height <= 0) {
                        this.logger_.warn(`[SkydropxProService] Invalid package details for warehouse ${normalizedWarehouseId}: ${JSON.stringify(packageDetails)}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // Determine which carriers to request based on package weight
                    const packageWeight = packageDetails.weight;
                    let requestedCarriers = ['fedex', 'dhl'];

                    // For automotive parts, we need to handle a wide range of weights
                    if (packageWeight < 50) {
                        this.logger_.info(`[SkydropxProService] Package weight ${packageWeight}kg - using standard services for small parts`)
                    } else if (packageWeight >= 50 && packageWeight < 68) {
                        this.logger_.info(`[SkydropxProService] Package weight ${packageWeight}kg - medium parts, may have limited LTL options`)
                    } else if (packageWeight >= 68 && packageWeight < 500) {
                        this.logger_.info(`[SkydropxProService] Package weight ${packageWeight}kg - heavy automotive parts, LTL services available`)
                    } else {
                        this.logger_.warn(`[SkydropxProService] Package weight ${packageWeight}kg - very heavy parts, may require special handling`)
                    }

                    const isInternational =
                        (origin.country_code || '').toUpperCase() !==
                        (destination.country_code || '').toUpperCase()

                    const requestData = {
                        quotation: {
                            address_from: origin,
                            address_to: destination,
                            parcels: [packageDetails],
                            requested_carriers: requestedCarriers,
                            ...(isInternational && {
                                products: (items as any[]).map((item: any, index: number) => {
                                    const hsCode = item.variant?.product?.hs_code || item.product_description || '0000000000'
                                    const description = item.product_description || item.title || `Item ${index + 1}`

                                    return {
                                        hs_code: String(hsCode).padStart(10, '0').slice(0, 10),
                                        description_en: description,
                                        country_code: item.variant?.product?.origin_country || 'MX',
                                        quantity: item.quantity || 1,
                                        price: item.unit_price || 0
                                    }
                                })
                            })
                        }
                    }

                    this.logger_.info(`[SkydropxProService] Requesting quotation for warehouse ${normalizedWarehouseId} with data: ${JSON.stringify(requestData)}`)

                    let response = null
                    const previousQuotation = await this.getQuotations(requestData)

                    if (!previousQuotation || (previousQuotation as any).error) {
                        this.logger_.warn(`[SkydropxProService] Failed to get quotation for warehouse ${normalizedWarehouseId}: ${JSON.stringify(previousQuotation)}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // Check if previousQuotation has the expected structure
                    if (!previousQuotation || typeof previousQuotation !== 'object') {
                        this.logger_.warn(`[SkydropxProService] Invalid quotation response structure for warehouse ${normalizedWarehouseId}: ${JSON.stringify(previousQuotation)}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // as the quotation can be incomplete wee need to get the quotation by id, if "is_completed": false,
                    if (previousQuotation.is_completed === false) {
                        const MAX_ATTEMPTS = 5;
                        const INITIAL_DELAY = 1000; // 1 second

                        let attempts = 0;
                        let quotation = previousQuotation;

                        this.logger_.info(`[SkydropxProService] Quotation ${quotation.id} is incomplete, polling for completion...`)

                        while (quotation && quotation.is_completed === false && attempts < MAX_ATTEMPTS) {
                            await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                            const updatedQuotation = await this.getQuotationById(quotation.id);
                            if (updatedQuotation && !updatedQuotation.error) {
                                quotation = updatedQuotation;
                                this.logger_.info(`[SkydropxProService] Quotation ${quotation.id} status: ${quotation.is_completed}`)
                            } else {
                                this.logger_.warn(`[SkydropxProService] Failed to get updated quotation ${quotation.id}`)
                                break;
                            }
                            attempts++;
                        }

                        response = quotation;
                    } else {
                        response = previousQuotation
                    }

                    if (!response || (response as any).error) {
                        this.logger_.warn(`[SkydropxProService] Invalid response for warehouse ${normalizedWarehouseId}: ${JSON.stringify(response)}`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }

                    // Validate response structure
                    const typedResponse = response as SkydropxResponse
                    if (!typedResponse.id || !Array.isArray(typedResponse.rates)) {
                        this.logger_.warn(`[SkydropxProService] Invalid response structure for warehouse ${normalizedWarehouseId}: missing id or rates array`)
                        return {
                            warehouse_id: normalizedWarehouseId,
                            rates: []
                        }
                    }
                    // Filter and map only valid rates
                    const validRates = typedResponse.rates?.filter(rate => {
                        // Only include rates that have a valid price and are applicable
                        const hasValidPrice = rate.total && parseFloat(rate.total) > 0;
                        const isApplicable = rate.status === 'price_found_internal' || rate.status === 'price_found_external';
                        const hasValidDays = rate.days && rate.days > 0;

                        // For automotive parts, we might want to include LTL services for heavy items
                        // but still filter out rates with no price or invalid status
                        const isValid = hasValidPrice && isApplicable && hasValidDays;

                        if (!isValid) {
                            this.logger_.debug(`[SkydropxProService] Filtered out rate ${rate.provider_name} ${rate.provider_service_name}: price=${rate.total}, status=${rate.status}, days=${rate.days}`)
                        }

                        return isValid;
                    }) || [];

                    this.logger_.info(`[SkydropxProService] Found ${validRates.length} valid rates out of ${typedResponse.rates?.length || 0} total rates for warehouse ${normalizedWarehouseId}`)

                    // If no valid rates found, log a warning but return empty array
                    if (validRates.length === 0) {
                        this.logger_.warn(`[SkydropxProService] No valid rates found for warehouse ${normalizedWarehouseId}. All rates were filtered out.`)
                    }

                    const normalizedRates: SkydropxCalculatedRate[] = validRates.map((rate) => {
                        const providerName = rate.provider_name ?? "unknown_provider"
                        const providerServiceCode = rate.provider_service_code ?? "unknown_service"
                        const calculatedId = `skydropx_${providerName}_${providerServiceCode}`

                        return {
                            id: calculatedId,
                            name: rate.provider_service_name,
                            price: parseFloat(rate.total || "0"),
                            data: {
                                provider_name: rate.provider_name,
                                provider_service_code: rate.provider_service_code,
                                estimated_days: rate.days,
                                currency_code: rate.currency_code,
                                quotation_id: typedResponse.id,
                                status: rate.status,
                                cost: rate.cost || parseFloat(rate.total || "0"),
                                zone: rate.zone,
                                weight: rate.weight,
                                success: true,
                            },
                            metadata: rate,
                        }
                    })

                    return {
                        warehouse_id: normalizedWarehouseId,
                        rates: normalizedRates,
                    }
                } catch (error) {
                    this.logger_.error(`[SkydropxProService] Error calculating rates for warehouse ${normalizedWarehouseId}: ${JSON.stringify(error)}`)
                    return {
                        warehouse_id: normalizedWarehouseId,
                        rates: []
                    }
                }
            })
        )

        return warehouseRates
    }

    /**
     * Retrieves a shipment by its ID.
     * 
     * @param id - The shipment ID.
     * @returns The shipment details.
     */
    async getShipmentById(id: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getShipmentById')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/shipments/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getShipmentById')
        }
    }

    /**
     * Creates a shipment label in Skydropx.
     * Validates data, requests creation, and polls for success status.
     * 
     * Operational Flow:
     * 1. Validation & Filtering:
     *    - Authenticates the request.
     *    - Filters order items to match the specific warehouse and fulfillment request.
     *    - Calculates the declared value based on the items being shipped.
     * 2. Address Resolution:
     *    - Resolves the origin address based on the warehouse ID.
     *    - Formats the destination address from the order details.
     * 3. Rate Selection:
     *    - Uses the provided `selectedRate` if available.
     *    - Otherwise, attempts to find the rate corresponding to the warehouse from the order's shipping methods.
     * 4. Creation Request:
     *    - Constructs the shipment payload with addresses, package details (weight, dimensions), and rate ID.
     *    - Sends the creation request to Skydropx (`POST /shipments`).
     * 5. **Polling Mechanism**:
     *    - If the shipment info returns a `workflow_status` of `'in_progress'`, it triggers a polling loop.
     *    - Waits with exponential backoff (starting at 1s) and retries fetching the shipment details (up to 10 attempts).
     *    - Ensures the process doesn't return until the label generation is successful or fails/times out.
     * 
     * @param order - The order details containing items and shipping address.
     * @param zipDetails - Zip code context.
     * @param fulfillment - The fulfillment object being processed.
     * @param warehouse - The warehouse ID to fulfill items from.
     * @param selectedRate - (Optional) Specific rate to force for this shipment.
     * @returns Object indicating success (`boolean`), the full shipment data, and the rate used.
     */
    async createShipment(
        order: any,
        zipDetails: any,
        fulfillment: any,
        warehouse: string,
        selectedRate?: SkydropxCalculatedRate
    ) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'createShipment')
        }

        if (!order?.items || !fulfillment?.items) {
            return this.handleApiError({ message: 'Invalid order or fulfillment data' }, 'createShipment')
        }

        const normalizedWarehouseId =
            typeof warehouse === "string" && warehouse.trim()
                ? warehouse.trim()
                : "default"

        // Filter items by warehouse and fulfillment
        const warehouseItems = order.items.filter(item => {
            const itemWarehouse = this.getAlmacenIdFromItem(item) || 'default'
            return itemWarehouse === normalizedWarehouseId &&
                fulfillment.items.some(fItem => fItem.line_item_id === item.id)
        })

        if (warehouseItems.length === 0) {
            return this.handleApiError({ message: 'No items found for the specified warehouse' }, 'createShipment')
        }

        // Calculate declared value
        const declaredValue = warehouseItems.reduce((sum, item) =>
            sum + (item.unit_price * item.quantity), 0)

        const origin = await this.getOriginAddress(normalizedWarehouseId)
        const destination = this.getDestinationAddress(order, zipDetails)

        if (!destination) {
            return this.handleApiError({ message: 'Invalid destination address' }, 'createShipment')
        }

        // Log address information for debugging
        this.logger_.info(`[SkydropxProService] Creating shipment for warehouse ${normalizedWarehouseId} with origin: ${origin.name} (${origin.postal_code}) and destination: ${destination.name} (${destination.postal_code})`)

        let resolvedRate: SkydropxCalculatedRate | undefined = selectedRate

        if (!resolvedRate) {
            const selectedShippingMethod = order.shipping_methods?.find(
                (method: any) => method.metadata?.warehouse_id === normalizedWarehouseId
            )

            resolvedRate = selectedShippingMethod?.metadata?.original_rate as SkydropxCalculatedRate | undefined
        }

        if (!resolvedRate?.metadata?.id) {
            return this.handleApiError({ message: 'No valid rate found for warehouse' }, 'createShipment')
        }

        const requestData = {
            shipment: {
                rate_id: resolvedRate.metadata.id,
                printing_format: 'thermal',
                address_from: origin,
                address_to: destination,
                packages: [{
                    package_number: "1",
                    package_protected: false,
                    declared_value: declaredValue,
                    consignment_note: '53102400',
                    package_type: '4G',
                    products: warehouseItems.map(item => ({
                        name: item.title || 'Product',
                        description_en: item.product_description || item.title || 'Product',
                        quantity: item.quantity || 1,
                        price: item.unit_price || 0,
                        sku: item.variant_sku || 'SKU',
                        hs_code: item.variant?.product?.hs_code || '0000000000',
                        hs_code_description: item.title || 'Product',
                        product_type_code: 'P',
                        product_type_name: 'Producto',
                        country_code: item.variant?.product?.origin_country || 'MX'
                    }))
                }]
            }
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/shipments", requestData, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })

            const MAX_ATTEMPTS = 10;
            const INITIAL_DELAY = 1000; // 1 second
            let attempts = 0;
            let shipment = response.data;

            while (shipment?.data?.attributes?.workflow_status === 'in_progress' && attempts < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                const updatedShipment = await this.getShipmentById(shipment.data.id);
                if (updatedShipment?.error) {
                    break
                }
                shipment = updatedShipment;
                attempts++;
            }

            return {
                success: shipment?.data?.attributes?.workflow_status === 'success',
                shipment: shipment,
                rate: resolvedRate
            }
        } catch (error) {
            return this.handleApiError(error, 'createShipment')
        }
    }

    /**
     * Lists shipments with pagination.
     * 
     * @param page - The page number to retrieve.
     * @returns List of shipments.
     */
    async getShipments(page: number) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getShipments')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/shipments?page=" + page, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return {
                success: true,
                shipments: response.data
            }

        } catch (error) {
            return this.handleApiError(error, 'getShipments')
        }
    }

    /**
     * Checks if a shipment is eligible for pickup.
     * 
     * @param shipment_id - The ID of the shipment to check.
     * @returns Coverage information.
     */
    async getPickupsCoverage(shipment_id: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getPickupsCoverage')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups/coverage?shipment_id=" + shipment_id, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getPickupsCoverage')
        }
    }

    /**
     * Reschedules a pickup for a new date/time.
     * 
     * @param id - The pickup ID.
     * @param data - The rescheduling data.
     * @returns The updated pickup information.
     */
    async reschedulePickup(id: string, data: any) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'reschedulePickup')
        }

        try {
            const requestData = {
                pickup: data
            }
            const response = await axios.post(this.options_.apiUrl + "/pickups/" + id + "/reschedule", requestData, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'reschedulePickup')
        }
    }

    /**
     * Lists pickups with pagination.
     * 
     * @param page - The page number to retrieve.
     * @returns List of pickups.
     */
    async getPickups(page: number) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getPickups')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups?page=" + page, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getPickups')
        }
    }

    /**
     * Retrieves a pickup by its ID.
     * 
     * @param id - The pickup ID.
     * @returns The pickup details.
     */
    async getPickup(id: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getPickup')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getPickup')
        }
    }

    /**
     * Schedules a new pickup.
     * Polls until the pickup is successfully scheduled.
     * 
     * @param data - The pickup creation data.
     * @returns The created pickup object.
     */
    async createPickup(data: any) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'createPickup')
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/pickups", data, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })

            const MAX_ATTEMPTS = 10;
            const INITIAL_DELAY = 1000; // 1 second
            let attempts = 0;
            let pickup = response.data;

            while (pickup?.data?.attributes?.status !== 'scheduled' && attempts < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                const updatedPickup = await this.getPickup(pickup.data.id);
                if (updatedPickup?.error) {
                    break
                }
                pickup = updatedPickup;
                attempts++;
            }

            return pickup;
        } catch (error) {
            return this.handleApiError(error, 'createPickup')
        }
    }

    /**
     * Lists orders from Skydropx (Platform specific).
     * 
     * @param page - (Optional) Page number.
     * @returns List of orders.
     */
    async getOrders(page?: number) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getOrders')
        }

        try {
            const url = page ? `${this.options_.apiUrl}/orders?page=${page}` : `${this.options_.apiUrl}/orders`
            const response = await axios.get(url, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getOrders')
        }
    }

    /**
     * Retrieves a Skydropx order by ID.
     * 
     * @param id - The order ID.
     * @returns The order details.
     */
    async getOrderById(id: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getOrderById')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/orders/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getOrderById')
        }
    }

    /**
     * Creates a new order in Skydropx platform.
     * 
     * @param data - The order data.
     * @returns The created order.
     */
    async createOrder(data: any) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'createOrder')
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/orders", data, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'createOrder')
        }
    }

    /**
     * Updates an existing order in Skydropx.
     * 
     * @param id - The order ID.
     * @param data - The data to update.
     * @returns The updated order.
     */
    async updateOrder(id: string, data: any) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'updateOrder')
        }

        try {
            const response = await axios.patch(this.options_.apiUrl + "/orders/" + id, data, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'updateOrder')
        }
    }

    /**
     * Lists products from Skydropx.
     * 
     * @param page - (Optional) Page number.
     * @param filters - (Optional) Filters like destination country.
     * @returns List of products.
     */
    async getProducts(page?: number, filters?: any) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'getProducts')
        }

        try {
            let url = `${this.options_.apiUrl}/products`
            const params = new URLSearchParams()
            if (page) params.append('page', page.toString())
            if (filters?.destination_country_code) params.append('filters[destination_country_code]', filters.destination_country_code)

            if (params.toString()) {
                url += '?' + params.toString()
            }

            const response = await axios.get(url, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'getProducts')
        }
    }

    /**
     * Cancels a shipment.
     * 
     * @param shipment_id - The ID of the shipment to cancel.
     * @param reason - The reason for cancellation.
     * @returns The cancellation response.
     */
    async cancelShipment(shipment_id: string, reason: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'cancelShipment')
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/shipments/" + shipment_id + "/cancellations", {
                reason: reason,
                shipment_id: shipment_id
            }, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'cancelShipment')
        }
    }

    /**
     * Adds protection coverage to a shipment.
     * 
     * @param shipment_id - The shipment ID.
     * @param declared_value - The value to declare for protection.
     * @returns The protection response.
     */
    async protectShipment(shipment_id: string, declared_value: number) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'protectShipment')
        }

        try {
            const response = await axios.post(this.options_.apiUrl + "/shipments/" + shipment_id + "/protect", {
                protect: {
                    declared_value: declared_value.toString(),
                    shipment_id: shipment_id
                }
            }, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'protectShipment')
        }
    }

    /**
     * Tracks a shipment by its tracking number.
     * 
     * @param tracking_number - The tracking number.
     * @param carrier_name - The carrier name.
     * @returns Tracking information.
     */
    async trackShipment(tracking_number: string, carrier_name: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'trackShipment')
        }

        try {
            const response = await axios.get(this.options_.apiUrl + "/shipments/tracking", {
                params: {
                    tracking_number: tracking_number,
                    carrier_name: carrier_name
                },
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'trackShipment')
        }
    }

    /**
     * Updates the default printing format (Standard or Thermal).
     * 
     * @param format - The desired format ('standard' or 'thermal').
     * @returns The update response.
     */
    async updatePrintingFormat(format: 'standard' | 'thermal') {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'updatePrintingFormat')
        }

        try {
            const response = await axios.patch(this.options_.apiUrl + "/settings/printing_formats", {
                printing_format: format
            }, {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                }
            })
            return response.data
        } catch (error) {
            return this.handleApiError(error, 'updatePrintingFormat')
        }
    }
}

export default SkydropxProService
