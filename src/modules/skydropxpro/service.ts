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
    amount: number | null;
    total: number | null;
    days: number | null;
    zone: string | null;
    weight: number;
}

type SkydropxResponse = {
    id: string;
    quotation_scope: {
        found_carriers: string[];
        carriers_scoped_to: string;
        not_found_carriers: string[];
    };
    is_completed: boolean;
    rates: SkydropxRate[];
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
     * Authenticate with Skydropx use axios
     * 
     */
    async authenticate(){
        let data = JSON.stringify({
        "grant_type": "client_credentials",
        "client_id": this.options_.apiKey,
        "client_secret": this.options_.apiSecret,
        "scope": "default orders.create"
        });

        let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: this.options_.apiUrl + "/oauth/token",
        headers: { 
            'Content-Type': 'application/json'
        },
        data : data
        };

        try {
            const response = await axios.request(config)
            return response.data.access_token
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }

    /**
     * Get quoatations
     * 
     */
    async getQuotations(data: any){
        const token = await this.authenticate()
        try {
            const response = await axios.post(this.options_.apiUrl + "/quotations", data, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            /**
             * 
            {
                "id": "b1d17298-953e-465a-bd94-080c03a15429",
                "quotation_scope": {
                    "carriers_scoped_to": "ALL_AVAILABLE"
                },
                "is_completed": false,
                "rates": [
                    {
                        "success": false,
                        "id": "5a57b039-9e4b-4797-b2dd-d4692bbe03a0",
                        "rate_type": null,
                        "provider_name": "paquetexpress",
                        "provider_service_name": "Nacional",
                        "provider_service_code": "nacional",
                        "status": "pending",
                        "currency_code": null,
                        "cost": null,
                        "amount": null,
                        "total": null,
                        "days": null,
                        "insurable": null,
                        "has_own_agreement": false,
                        "own_agreement_amount": null,
                        "extra_fees": null,
                        "zone": "flat",
                        "country_code": null,
                        "plan_type": null,
                        "error_messages": null,
                        "weight": 2
                    },
                    ...
                ]
            }
             */
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }
    
    /**
     * Get quoatation by id
     * 
     */
    async getQuotationById(id: string){
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/quotations/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            /**
             *
            {
                "id": "fc943c08-1ca0-4b55-9479-22527f835325",
                "quotation_scope": {
                    "found_carriers": [
                        "fedex",
                        "dhl"
                    ],
                    "carriers_scoped_to": "ALL_AVAILABLE",
                    "not_found_carriers": []
                },
                "is_completed": true,
                "rates": [
                    {
                        "success": true,
                        "id": "03bdea2d-13b4-4972-9359-680e33692ae1",
                        "rate_type": "default",
                        "provider_name": "fedex",
                        "provider_service_name": "Standard Overnight",
                        "provider_service_code": "standard_overnight",
                        "status": "price_found_internal",
                        "currency_code": "MXN",
                        "cost": "103.37",
                        "amount": "136.0",
                        "total": "136.0",
                        "days": 1,
                        "insurable": null,
                        "has_own_agreement": false,
                        "own_agreement_amount": null,
                        "extra_fees": [],
                        "zone": "1",
                        "country_code": "MX",
                        "plan_type": "acquisition",
                        "error_messages": {},
                        "weight": 2
                    }
                ]
            }
             */
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
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
        let totalWeight = 0
        let maxDimensions = { length: 0, width: 0, height: 0 }
  
        items.forEach(item => {
            const quantity = item.quantity
            totalWeight += (item.variant?.weight || 1) * quantity
    
            // Update max dimensions (assuming dimensions are in cm)
            maxDimensions.length = Math.max(maxDimensions.length, item.variant?.length || 10)
            maxDimensions.width = Math.max(maxDimensions.width, item.variant?.width || 10)
            maxDimensions.height = Math.max(maxDimensions.height, item.variant?.height || 10)
        })
    
        return {
            length: maxDimensions.length,
            width: maxDimensions.width,
            height: maxDimensions.height,
            weight: totalWeight
        }
    }
  
    getOriginAddress() {
        return {
            country_code: "mx",
            postal_code: parseInt(process.env.STORE_ZIP_CODE || '54030'),
            area_level1: process.env.STORE_STATE || 'Estado de México',
            area_level2: process.env.STORE_MUNICIPALITY || 'Tlalnepantla',
            area_level3: process.env.STORE_SUBURB || 'Centro Industrial Tlalnepantla',
            street1: process.env.STORE_ADDRESS || 'Perif. Blvd. Manuel Ávila Camacho',
            apartment_number: process.env.STORE_EXT_NUMBER || '3039',
            reference: process.env.STORE_REFERENCE || 'Agencia automovil',
            name: process.env.STORE_NAME || 'Toyota Satelite',
            company: process.env.STORE_NAME || 'HCW Store',
            phone: parseInt(process.env.STORE_PHONE?.replace(/\D/g, '') || '5555555555'),
            email: process.env.STORE_EMAIL || 'store@email.com'
        }
    }
  
    getDestinationAddress(cart: any, zipDetails: any) {
        const address = cart.shipping_address
        return {
            country_code: "mx",
            postal_code: zipDetails.replace(/\D/g, ''),  // Keep only digits but as string
            area_level1: address.province || 'N/A',
            area_level2: address.city || 'N/A',
            area_level3: address.district || 'N/A',
            street1: address.address_1,
            apartment_number: address.address_2 || '1',
            reference: address.address_1 + ' ' + address.address_2,  // Optional reference field 
            name: `${address.first_name} ${address.last_name}`,
            company: address.company || '',
            phone: parseInt(address.phone?.replace(/\D/g, '') || '0'),
            email: cart.email
        }
    }

    async  calculateShippingRates(cart: any, zipDetails: any) {
        // Group items by warehouse
        const warehouseItems = cart.items.reduce((acc, item) => {
          const warehouseId = item.variant_sku.split('||')[1]
          if (!acc[warehouseId]) {
            acc[warehouseId] = []
          }
          acc[warehouseId].push(item)
          return acc
        }, {})
      
        // Calculate rates for each warehouse
        const warehouseRates = await Promise.all(
          Object.entries(warehouseItems).map(async ([warehouseId, items]) => {
            const packageDetails = this.calculatePackageDetails(items)
            const origin = this.getOriginAddress()
            const destination = this.getDestinationAddress(cart, zipDetails)
            // console.log('packageDetails', packageDetails)
            // console.log('origin', origin)
            // console.log('destination', destination)
            const requestData = {
                quotation:{
                    address_from: origin,
                    address_to: destination,
                    parcel: packageDetails,
                    requested_carriers: ['fedex', 'dhl']
                } 
            }
            let response = null
            // console.log('requestData', JSON.stringify(requestData))
            const previousQuotation = await this.getQuotations(requestData)
            // as the quotation can be incomplete wee need to get the quotation by id, if "is_completed": false,
            if (!previousQuotation.is_completed) {
                const MAX_ATTEMPTS = 5;
                const INITIAL_DELAY = 1000; // 1 second

                let attempts = 0;
                let quotation = previousQuotation;

                while (!quotation.is_completed && attempts < MAX_ATTEMPTS) {
                    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                    quotation = await this.getQuotationById(quotation.id);
                    attempts++;
                }

                response = quotation;
            } else {
                response = previousQuotation
            }
            // if "is_completed": true,
            
            if (!response) {
                return {
                    warehouse_id: warehouseId,
                    rates: []
                }
            }
            const typedResponse = response as SkydropxResponse
            return {
              warehouse_id: warehouseId,
              rates: typedResponse.rates.map(rate => ({
                id: `skydropx_${rate.provider_name}_${rate.provider_service_code}`,
                name: rate.provider_service_name,
                price: rate.total || 0,
                data: {
                  provider_name: rate.provider_name,
                  provider_service_code: rate.provider_service_code,
                  estimated_days: rate.days,
                  currency_code: rate.currency_code,
                  quotation_id: (response as SkydropxResponse).id,
                  status: rate.status,
                  cost: rate.cost,
                  zone: rate.zone,
                  weight: rate.weight,
                  success: rate.success
                },
                metadata: rate
              }))
            }
          })
        )
      
        return warehouseRates
    }
    async getShipmentById(id: string){
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/shipments/" + id, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }   
    }
    
    async createShipment(order: any, zipDetails: any, fulfillment: any, warehouse: string) {
        const token = await this.authenticate()
        
        // Filter items by warehouse and fulfillment
        const warehouseItems = order.items.filter(item => {
            const itemWarehouse = item.variant_sku.split('||')[1]
            return itemWarehouse === warehouse && 
                   fulfillment.items.some(fItem => fItem.line_item_id === item.id)
        })
        // console.log('warehouseItems', JSON.stringify(warehouseItems))

        // Calculate declared value
        const declaredValue = warehouseItems.reduce((sum, item) => 
            sum + (item.unit_price * item.quantity), 0)

        const origin = this.getOriginAddress()
        const destination = this.getDestinationAddress(order, zipDetails)
        const selectedShippingMethod = order.shipping_methods.find(
            (method: any) => method.metadata.warehouse_id === warehouse
        )
        // console.log('selectedShippingMethod', JSON.stringify(selectedShippingMethod))

        const requestData = {
            shipment: {
                quotation_id: selectedShippingMethod.metadata.quotation_id,
                rate_id: selectedShippingMethod.metadata.original_rate.metadata.id,
                protected: false,
                declared_value: declaredValue,
                printing_format: 'thermal',
                address_from: origin,
                address_to: destination,
                consignment_note: '53102400',
                package_type: '4G',
                products: warehouseItems.map(item => ({
                    // product_id: item.id,
                    name: item.title,
                    description_en: item.product_description || item.title,
                    quantity: item.quantity,
                    price: item.unit_price,
                    sku: item.variant_sku,
                    hs_code: item.variant?.product?.hs_code || '0000000000',
                    hs_code_description: item.title,
                    product_type_code: 'P',
                    product_type_name: 'Producto',
                    country_code: item.variant?.product?.origin_country || 'MX'
                }))
            }
        }
        // console.log('requestData', JSON.stringify(requestData))
        try {
            const response = await axios.post(this.options_.apiUrl + "/shipments", requestData, {
                headers: { 'Authorization': 'Bearer ' + token }
            })

            const MAX_ATTEMPTS = 10;
            const INITIAL_DELAY = 1000; // 1 second
            let attempts = 0;
            let shipment = response.data;

            while (shipment?.data?.attributes?.workflow_status === 'in_progress' && attempts < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                const updatedShipment = await this.getShipmentById(shipment.data.id);
                shipment = updatedShipment;
                attempts++;
            }

            return {
                success: shipment?.data?.attributes?.workflow_status === 'success',
                shipment: shipment
            }
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            return {
                success: false,
                shipment: null
            }
        }
    } 
    // /api/v1/shipments
    /**
     * Get shipments by order id
     * page query
        Type:
        integer
     */
    async getShipments(page: number) {
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/shipments?page=" + page, {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            return {
                success: true,
                shipments: response.data
            }

        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
            return {
                success: false,
                shipments: []
            }
        }
    }
    /**
     *    GET /api/v1/pickups/coverage?shipment_id={shipment_id}
     */
    async getPickupsCoverage(shipment_id: string) {
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups/coverage?shipment_id=" + shipment_id, {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }
    
    /**
     * Resumen: Reprograma una recolección

        Descripción:
        POST /api/v1/pickups/{id}/reschedule
        Este endpoint permite reprogramar una recolección

        Parámetros de la solicitud:

        reference_shipment_id: Id del envio a recolectar
        packages: Número de paquetes a recolectar
        total_weight: Peso total de los paquetes a recolectar
        scheduled_from: Fecha y hora de inicio de franja horaria de recolección
        scheduled_to: Fecha y hora final de franja horaria de recolección
        {
            "pickup": {
                "reference_shipment_id": "0ac5adcc-a13d-427d-81dd-9ddd70b2f660",
                "packages": 5,
                "total_weight": 11,
                "scheduled_from": "2024-09-24 09:00:00",
                "scheduled_to": "2024-09-24 14:00:00"
            }
            }

     */
    async reschedulePickup(id: string, data: any) {
        const token = await this.authenticate()
        try {
            const requestData = {
                pickup: data
            }
            const response = await axios.post(this.options_.apiUrl + "/pickups/" + id + "/reschedule", requestData, {
                headers: { 'Authorization': 'Bearer ' + token }
            })  
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }

    /**
     * Resumen: Recupera todas las recolecciones

        Descripción:
        GET /api/v1/pickups?page={page}
        Este endpoint recupera todas las recolecciones, paginadas de diez en diez.

        Parámetros:
        page query
        Nro de página

        Type:
        integer
     */
    async getPickups(page: number) {
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups?page=" + page, {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }

    /**
     * Resumen: Detalle de Recolección
        Descripción:
        GET /api/v1/pickups/{id}
        Este endpoint recupera una recolección

        Parámetros:
        id path
        Required
        ID de la recolección

        Type:
        string
     */
    async getPickup(id: string) {
        const token = await this.authenticate()
        try {
            const response = await axios.get(this.options_.apiUrl + "/pickups/" + id, {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            return response.data
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            // throw error
        }
    }
    /**
     * Resumen: Programa una recolección

        Descripción:
        POST /api/v1/pickups/
        Este endpoint permite programar una recolección

        Parámetros de la solicitud:

        reference_shipment_id: Id del envio a recolectar
        packages: Número de paquetes a recolectar
        total_weight: Peso total de los paquetes a recolectar
        scheduled_from: Fecha y hora de inicio de franja horaria de recolección
        scheduled_to: Fecha y hora final de franja horaria de recolección
        {
            "pickup": {
                "reference_shipment_id": "0ac5adcc-a13d-427d-81dd-9ddd70b2f660",
                "packages": 5,
                "total_weight": 11,
                "scheduled_from": "2024-09-24 09:00:00",
                "scheduled_to": "2024-09-24 14:00:00"
            }
        }
     */
    async createPickup(data: any) {
        const token = await this.authenticate()
        try {
            const response = await axios.post(this.options_.apiUrl + "/pickups", data, {
                headers: { 'Authorization': 'Bearer ' + token }
            })

            const MAX_ATTEMPTS = 10;
            const INITIAL_DELAY = 1000; // 1 second
            let attempts = 0;
            let pickup = response.data;

            while (pickup?.data?.attributes?.status !== 'scheduled' && attempts < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * Math.pow(2, attempts)));
                const updatedPickup = await this.getPickup(pickup.data.id);
                pickup = updatedPickup;
                attempts++;
            }

            return pickup;
        } catch (error) {
            this.logger_.error(JSON.stringify(error.response.data))
            return null;
        }
    }
    
    
}

export default SkydropxProService