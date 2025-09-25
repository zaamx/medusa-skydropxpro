import { MedusaService } from "@medusajs/framework/utils"
import { Parcel, ParcelService } from "./models/skydropx"
import { Logger } from "@medusajs/framework/types"
import axios from "axios"

type SkydropxProServiceOptions = {
  apiUrl: string,
  apiKey: string,
  apiSecret: string
}

type SkydropxRate = {
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

type SkydropxResponse = {
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

type SkydropxShipmentResponse = {
    success: boolean;
    shipment: any;
}

class SkydropxProService extends MedusaService({
  Parcel,
  ParcelService
}){
    protected readonly options_: SkydropxProServiceOptions
    protected readonly logger_: Logger

    constructor(
        { logger }: { logger: Logger },
        options: SkydropxProServiceOptions
      ) {
        // @ts-ignore
        super(...arguments)
        this.options_ = options
        this.logger_ = logger
      }

    /**
     * Helper method to handle API errors consistently
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
     * Validate required configuration
     */
    private validateConfig(): boolean {
        if (!this.options_.apiKey || !this.options_.apiSecret || !this.options_.apiUrl) {
            this.logger_.error('[SkydropxProService] Missing required configuration: apiKey, apiSecret, or apiUrl')
            return false
        }
        return true
    }

    /**
     * Authenticate with Skydropx use axios
     * Updated to match new OAuth endpoint structure
     */
    async authenticate(){
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
     * Get quotations
     * Updated to match new API structure
     */
    async getQuotations(data: any){
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
     * Get quotation by id
     * Updated to match new API structure
     */
    async getQuotationById(id: string){
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

    async getZipCodeDetails(postcode: string) {
        /* TODO: Implement this */
        return postcode
    }
    
    async getClientBalance() {
        /* TODO: Implement this */
        return 0
    }

    calculatePackageDetails(items: any) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            this.logger_.warn('[SkydropxProService] No items provided for package calculation')
            return {
                length: 10,
                width: 10,
                height: 10,
                weight: 1
            }
        }

        let totalWeight = 0
        let maxDimensions = { length: 0, width: 0, height: 0 }
  
        items.forEach(item => {
            const quantity = item.quantity || 1
            const itemWeight = item.variant?.weight || 1
            totalWeight += itemWeight * quantity
    
            // Update max dimensions (assuming dimensions are in cm)
            maxDimensions.length = Math.max(maxDimensions.length, item.variant?.length || 10)
            maxDimensions.width = Math.max(maxDimensions.width, item.variant?.width || 10)
            maxDimensions.height = Math.max(maxDimensions.height, item.variant?.height || 10)
        })
        
        // Ensure minimum weight for LTL services (most require >68kg)
        // For automotive parts, we need to handle heavy components
        const minWeight = 0.5; // 500g minimum
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
  
    getOriginAddress() {
        const postalCode = String(process.env.STORE_ZIP_CODE || '54030').trim()
        if (!postalCode || postalCode === '') {
            this.logger_.warn('[SkydropxProService] Empty postal code in origin address, using default')
        }
        
        const storeName = process.env.STORE_NAME || 'Toyota Satelite'
        if (!storeName || storeName.trim() === '') {
            this.logger_.warn('[SkydropxProService] Empty store name in origin address, using default')
        }
        
        return {
            country_code: "MX",
            postal_code: postalCode || '54030',
            area_level1: process.env.STORE_STATE || 'Estado de México',
            area_level2: process.env.STORE_MUNICIPALITY || 'Tlalnepantla',
            area_level3: process.env.STORE_SUBURB || 'Centro Industrial Tlalnepantla',
            street1: process.env.STORE_ADDRESS || 'Perif. Blvd. Manuel Ávila Camacho',
            internal_number: process.env.STORE_EXT_NUMBER || '3039',
            reference: process.env.STORE_REFERENCE || 'Agencia automovil',
            name: storeName.trim() || 'Toyota Satelite',
            company: storeName.trim() || 'HCW Store',
            phone: process.env.STORE_PHONE || '5555555555',
            email: process.env.STORE_EMAIL || 'store@email.com'
        }
    }
  
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
            reference: (address.address_1 + ' ' + address.address_2) || 'N/A',
            name: customerName || 'Customer Name',
            company: address.company || '',
            phone: address.phone || '0',
            email: cart.email || 'n/a@example.com'
        }
    }

    async calculateShippingRates(cart: any, zipDetails: any) {
        if (!cart?.items || !Array.isArray(cart.items) || cart.items.length === 0) {
            this.logger_.warn('[SkydropxProService] No cart items provided for rate calculation')
            return []
        }

        // Group items by warehouse
        const warehouseItems = cart.items.reduce((acc, item) => {
          const warehouseId = item.variant_sku?.split('||')[1] || 'default'
          if (!acc[warehouseId]) {
            acc[warehouseId] = []
          }
          acc[warehouseId].push(item)
          return acc
        }, {})
      
        // Calculate rates for each warehouse
        const warehouseRates = await Promise.all(
          Object.entries(warehouseItems).map(async ([warehouseId, items]) => {
            try {
                this.logger_.info(`[SkydropxProService] Processing warehouse ${warehouseId} with ${(items as any[]).length} items`)
                const packageDetails = this.calculatePackageDetails(items)
                const origin = this.getOriginAddress()
                const destination = this.getDestinationAddress(cart, zipDetails)
                
                if (!destination) {
                    this.logger_.warn(`[SkydropxProService] Invalid destination address for warehouse ${warehouseId}`)
                    return {
                        warehouse_id: warehouseId,
                        rates: []
                    }
                }
                
                // Validate address data
                if (!origin.postal_code || !destination.postal_code) {
                    this.logger_.warn(`[SkydropxProService] Missing postal codes for warehouse ${warehouseId}`)
                    return {
                        warehouse_id: warehouseId,
                        rates: []
                    }
                }
                
                // Validate package details
                if (!packageDetails || packageDetails.weight <= 0 || packageDetails.length <= 0 || packageDetails.width <= 0 || packageDetails.height <= 0) {
                    this.logger_.warn(`[SkydropxProService] Invalid package details for warehouse ${warehouseId}: ${JSON.stringify(packageDetails)}`)
                    return {
                        warehouse_id: warehouseId,
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
                
                const isInternational = origin.country_code !== destination.country_code

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

                this.logger_.info(`[SkydropxProService] Requesting quotation for warehouse ${warehouseId} with data: ${JSON.stringify(requestData)}`)

                let response = null
                const previousQuotation = await this.getQuotations(requestData)
                
                if (!previousQuotation || (previousQuotation as any).error) {
                    this.logger_.warn(`[SkydropxProService] Failed to get quotation for warehouse ${warehouseId}: ${JSON.stringify(previousQuotation)}`)
                    return {
                        warehouse_id: warehouseId,
                        rates: []
                    }
                }
                
                // Check if previousQuotation has the expected structure
                if (!previousQuotation || typeof previousQuotation !== 'object') {
                    this.logger_.warn(`[SkydropxProService] Invalid quotation response structure for warehouse ${warehouseId}: ${JSON.stringify(previousQuotation)}`)
                    return {
                        warehouse_id: warehouseId,
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
                    this.logger_.warn(`[SkydropxProService] Invalid response for warehouse ${warehouseId}: ${JSON.stringify(response)}`)
                    return {
                        warehouse_id: warehouseId,
                        rates: []
                    }
                }
                
                // Validate response structure
                const typedResponse = response as SkydropxResponse
                if (!typedResponse.id || !Array.isArray(typedResponse.rates)) {
                    this.logger_.warn(`[SkydropxProService] Invalid response structure for warehouse ${warehouseId}: missing id or rates array`)
                    return {
                        warehouse_id: warehouseId,
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
                
                this.logger_.info(`[SkydropxProService] Found ${validRates.length} valid rates out of ${typedResponse.rates?.length || 0} total rates for warehouse ${warehouseId}`)
                
                // If no valid rates found, log a warning but return empty array
                if (validRates.length === 0) {
                    this.logger_.warn(`[SkydropxProService] No valid rates found for warehouse ${warehouseId}. All rates were filtered out.`)
                }
                
                return {
                  warehouse_id: warehouseId,
                  rates: validRates.map(rate => ({
                    id: `skydropx_${rate.provider_name}_${rate.provider_service_code}`,
                    name: rate.provider_service_name,
                    price: parseFloat(rate.total || '0'),
                    data: {
                      provider_name: rate.provider_name,
                      provider_service_code: rate.provider_service_code,
                      estimated_days: rate.days,
                      currency_code: rate.currency_code,
                      quotation_id: typedResponse.id,
                      status: rate.status,
                      cost: rate.cost || parseFloat(rate.total || '0'), // Use total as cost if cost is null
                      zone: rate.zone,
                      weight: rate.weight,
                      success: true // Mark as successful since we filtered for valid rates
                    },
                    metadata: rate
                  }))
                }
            } catch (error) {
                this.logger_.error(`[SkydropxProService] Error calculating rates for warehouse ${warehouseId}: ${JSON.stringify(error)}`)
                return {
                    warehouse_id: warehouseId,
                    rates: []
                }
            }
          })
        )
      
        return warehouseRates
    }

    async getShipmentById(id: string){
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
    
    async createShipment(order: any, zipDetails: any, fulfillment: any, warehouse: string) {
        const token = await this.authenticate()
        if (!token) {
            return this.handleApiError({ message: 'Authentication failed' }, 'createShipment')
        }
        
        if (!order?.items || !fulfillment?.items) {
            return this.handleApiError({ message: 'Invalid order or fulfillment data' }, 'createShipment')
        }
        
        // Filter items by warehouse and fulfillment
        const warehouseItems = order.items.filter(item => {
            const itemWarehouse = item.variant_sku?.split('||')[1] || 'default'
            return itemWarehouse === warehouse && 
                   fulfillment.items.some(fItem => fItem.line_item_id === item.id)
        })

        if (warehouseItems.length === 0) {
            return this.handleApiError({ message: 'No items found for the specified warehouse' }, 'createShipment')
        }

        // Calculate declared value
        const declaredValue = warehouseItems.reduce((sum, item) => 
            sum + (item.unit_price * item.quantity), 0)

        const origin = this.getOriginAddress()
        const destination = this.getDestinationAddress(order, zipDetails)
        
        if (!destination) {
            return this.handleApiError({ message: 'Invalid destination address' }, 'createShipment')
        }
        
        // Log address information for debugging
        this.logger_.info(`[SkydropxProService] Creating shipment with origin: ${origin.name} (${origin.postal_code}) and destination: ${destination.name} (${destination.postal_code})`)
        
        const selectedShippingMethod = order.shipping_methods?.find(
            (method: any) => method.metadata?.warehouse_id === warehouse
        )

        if (!selectedShippingMethod?.metadata?.original_rate?.metadata?.id) {
            return this.handleApiError({ message: 'No valid shipping method found for warehouse' }, 'createShipment')
        }

        const requestData = {
            shipment: {
                rate_id: selectedShippingMethod.metadata.original_rate.metadata.id,
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
                shipment: shipment
            }
        } catch (error) {
            return this.handleApiError(error, 'createShipment')
        }
    } 
    
    /**
     * Get shipments by order id
     * Updated to match new API structure
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
     * Get pickup coverage
     * Updated to match new API structure
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
     * Reschedule pickup
     * Updated to match new API structure
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
     * Get pickups
     * Updated to match new API structure
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
     * Get pickup by id
     * Updated to match new API structure
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
     * Create pickup
     * Updated to match new API structure
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
     * Get orders
     * New endpoint from updated API
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
     * Get order by id
     * New endpoint from updated API
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
     * Create order
     * New endpoint from updated API
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
     * Update order
     * New endpoint from updated API
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
     * Get products
     * New endpoint from updated API
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
     * Cancel shipment
     * New endpoint from updated API
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
     * Protect shipment
     * New endpoint from updated API
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
     * Track shipment
     * New endpoint from updated API
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
     * Update printing format
     * New endpoint from updated API
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
