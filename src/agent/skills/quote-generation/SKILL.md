---
name: quote-generation
description: Instructions and structure requirements for generating a service quote.
---
# Quote Generation Guide

When you are ready to generate a quote for a client, you must construct it using the exact structure expected by the system. You will typically be using the quote computation tool.

## Quote Structure

A quote consists of the following components based on the frontend structure:

- **line_items**: An array of line items. Each line item must have:
  - `name`: Description of the item or service.
  - `quantity`: Number of units (must be a number).
  - `unit_price`: Price per unit in NGN (must be a number).
  - `total`: `quantity * unit_price`.
  
- **contingencies**: Additional fees, taxes, or discounts (e.g., VAT, Logistics). Each must have:
  - `label`: Name of the contingency.
  - `rate`: Rate as a decimal (e.g., 0.05 for 5%) OR null if it's a fixed amount.
  - `amount`: Absolute amount in NGN (must be a number).

- **subtotal**: Sum of all line item totals (must be a number).
- **total**: Subtotal + sum of all contingency amounts (must be a number).
- **status**: The backend stores a generated quote as `awaiting_approval` until
  the SME approves it; approval changes it to `sent`.

## Best Practices
- Ensure all math is perfectly accurate.
- Present the quote details clearly to the user before finalizing, and ensure all requested services are covered by the line items.
- Ensure the NGN amounts are provided as raw numbers. The formatting will be handled by the UI.
- Do not make up arbitrary prices if they haven't been provided in the business brief or estimated based on standard known rates.
