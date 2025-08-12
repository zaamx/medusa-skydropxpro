<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa Plugin Starter
</h1>

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Building blocks for digital commerce
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
    <a href="https://www.producthunt.com/posts/medusa"><img src="https://img.shields.io/badge/Product%20Hunt-%231%20Product%20of%20the%20Day-%23DA552E" alt="Product Hunt"></a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

## Compatibility

This starter is compatible with versions >= 2.4.0 of `@medusajs/medusa`. 

## Getting Started

Visit the [Quickstart Guide](https://docs.medusajs.com/learn/installation) to set up a server.

Visit the [Plugins documentation](https://docs.medusajs.com/learn/fundamentals/plugins) to learn more about plugins and how to create them.

Visit the [Docs](https://docs.medusajs.com/learn/installation#get-started) to learn more about our system requirements.

## What is Medusa

Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about [Medusa’s architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the Docs.

## Community & Contributions

The community and core team are available in [GitHub Discussions](https://github.com/medusajs/medusa/discussions), where you can ask for support, discuss roadmap, and share ideas.

Join our [Discord server](https://discord.com/invite/medusajs) to meet other community members.

## Other channels

- [GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Twitter](https://twitter.com/medusajs)
- [LinkedIn](https://www.linkedin.com/company/medusajs)
- [Medusa Blog](https://medusajs.com/blog/)

node_modules/@medusajs/medusa/dist/commands/plugin/db/generate.js
-- npx medusa plugin:publish

npx medusa plugin:db:generate

 Plugin Development
npx medusa plugin:develop

Plugin DB generation
npx medusa plugin:db:generate

On Medusa Main Project
npx medusa db:migrate

on MasFactura Module
npx medusa plugin:build 
npm publish --access public

# Medusa Skydropx Pro Plugin

A Medusa plugin for integrating with Skydropx Pro shipping services. This plugin has been updated to work with the latest Skydropx API.

## Features

- **Shipping Rate Calculation**: Get shipping rates from multiple carriers (FedEx, DHL, etc.)
- **Shipment Creation**: Create shipments with tracking numbers and labels
- **Order Management**: Create and manage orders in Skydropx
- **Pickup Management**: Schedule and manage pickups
- **Shipment Tracking**: Track shipments in real-time
- **Shipment Protection**: Add insurance to shipments
- **Product Management**: Manage products in Skydropx catalog
- **Printing Format Settings**: Configure label printing formats

## Installation

1. Install the plugin:
```bash
npm install @zaamx/medusa-skydropxpro
```

2. Add the plugin to your Medusa configuration:
```typescript
// medusa-config.js
import { ConfigModule } from '@medusajs/medusa'
import { SkydropxProModule } from '@zaamx/medusa-skydropxpro'

const config: ConfigModule = {
  modules: {
    [SkydropxProModule.PACKAGE_NAME]: {
      resolve: SkydropxProModule,
      options: {
        apiUrl: 'https://pro.skydropx.com/api/v1',
        apiKey: process.env.SKYDROPPX_API_KEY,
        apiSecret: process.env.SKYDROPPX_API_SECRET,
      },
    },
  },
}

export default config
```

3. Set up environment variables:
```bash
SKYDROPPX_API_KEY=your_api_key_here
SKYDROPPX_API_SECRET=your_api_secret_here
STORE_ZIP_CODE=54030
STORE_STATE=Estado de México
STORE_MUNICIPALITY=Tlalnepantla
STORE_SUBURB=Centro Industrial Tlalnepantla
STORE_ADDRESS=Perif. Blvd. Manuel Ávila Camacho
STORE_EXT_NUMBER=3039
STORE_REFERENCE=Agencia automovil
STORE_NAME=Toyota Satelite
STORE_PHONE=5555555555
STORE_EMAIL=store@email.com
```

## API Endpoints

### Store Endpoints

#### Get Shipping Rates
```http
POST /store/skydropxpro/quotations
Content-Type: application/json

{
  "cart": {
    "items": [...],
    "shipping_address": {...},
    "email": "customer@example.com"
  }
}
```

### Admin Endpoints

#### Test Connection
```http
GET /admin/skydropxpro
```

#### Shipments
```http
GET /admin/skydropxpro/shipments?page=1
POST /admin/skydropxpro/shipments
GET /admin/skydropxpro/shipments/{id}
POST /admin/skydropxpro/shipments/{id}/cancel
POST /admin/skydropxpro/shipments/{id}/protect
GET /admin/skydropxpro/shipments/tracking?tracking_number=123&carrier_name=fedex
```

#### Orders
```http
GET /admin/skydropxpro/orders?page=1
POST /admin/skydropxpro/orders
GET /admin/skydropxpro/orders/{id}
PATCH /admin/skydropxpro/orders/{id}
```

#### Pickups
```http
GET /admin/skydropxpro/pickups?page=1
POST /admin/skydropxpro/pickups
GET /admin/skydropxpro/pickups/{id}
POST /admin/skydropxpro/pickups/{id}/reschedule
GET /admin/skydropxpro/pickups/coverage?shipment_id={id}
```

#### Products
```http
GET /admin/skydropxpro/products?page=1&filters={"destination_country_code":"MX"}
```

#### Settings
```http
PATCH /admin/skydropxpro/settings/printing-formats
Content-Type: application/json

{
  "printing_format": "thermal"
}
```

## Usage Examples

### Getting Shipping Rates

```typescript
import { getQuotationSkydropxproWorkflow } from '@zaamx/medusa-skydropxpro/workflows'

const { result } = await getQuotationSkydropxproWorkflow(scope).run({
  input: { cart }
})

console.log(result.quotation)
```

### Creating a Shipment

```typescript
import { createShipmentSkydropxproWorkflow } from '@zaamx/medusa-skydropxpro/workflows'

const { result } = await createShipmentSkydropxproWorkflow(scope).run({
  input: { 
    order, 
    fulfillment, 
    warehouse: "warehouse_id" 
  }
})

console.log(result.shipment)
```

### Using the Service Directly

```typescript
import { SKYDROPPX_MODULE } from '@zaamx/medusa-skydropxpro'
import SkydropxProService from '@zaamx/medusa-skydropxpro/modules/skydropxpro/service'

const skydropxService: SkydropxProService = container.resolve(SKYDROPPX_MODULE)

// Get shipping rates
const rates = await skydropxService.calculateShippingRates(cart, zipCode)

// Create shipment
const shipment = await skydropxService.createShipment(order, zipCode, fulfillment, warehouse)

// Track shipment
const tracking = await skydropxService.trackShipment(trackingNumber, carrierName)
```

## Key Changes in Latest Update

### API Structure Updates
- Updated to use the new Skydropx Pro API base URL: `https://pro.skydropx.com/api/v1`
- Updated OAuth authentication flow
- Updated quotation API structure with new field names
- Updated shipment creation API with new required fields

### New Features
- **Orders API**: Full CRUD operations for orders
- **Products API**: Product catalog management
- **Shipment Protection**: Add insurance to shipments
- **Shipment Cancellation**: Cancel shipments with reasons
- **Shipment Tracking**: Real-time tracking information
- **Printing Format Settings**: Configure label printing

### Field Name Changes
- `parcel` → `parcels` (array)
- `name` → `person_name`
- `apartment_number` → `internal_number`
- `country_code`: Now uses uppercase format ("MX" instead of "mx")
- `amount` and `total`: Now returned as strings instead of numbers

### Error Handling
- Improved error handling with proper error propagation
- Better logging of API errors
- Consistent error response format

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SKYDROPPX_API_KEY` | Your Skydropx API key | Yes | - |
| `SKYDROPPX_API_SECRET` | Your Skydropx API secret | Yes | - |
| `STORE_ZIP_CODE` | Store postal code | No | 54030 |
| `STORE_STATE` | Store state/province | No | Estado de México |
| `STORE_MUNICIPALITY` | Store city/municipality | No | Tlalnepantla |
| `STORE_SUBURB` | Store neighborhood | No | Centro Industrial Tlalnepantla |
| `STORE_ADDRESS` | Store street address | No | Perif. Blvd. Manuel Ávila Camacho |
| `STORE_EXT_NUMBER` | Store internal number | No | 3039 |
| `STORE_REFERENCE` | Store reference | No | Agencia automovil |
| `STORE_NAME` | Store name | No | Toyota Satelite |
| `STORE_PHONE` | Store phone number | No | 5555555555 |
| `STORE_EMAIL` | Store email | No | store@email.com |

## Support

For issues and questions, please contact:
- Email: api@skydropx.com
- Documentation: [Skydropx API Documentation](https://pro.skydropx.com/api/v1)

## License

MIT