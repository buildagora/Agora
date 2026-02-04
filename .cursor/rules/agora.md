# Agora Cursor Rules (Project Constitution)

## What we are building
Agora is a reverse-auction marketplace for construction materials:
- Buyers create RFQs with line items and required terms.
- Sellers browse OPEN RFQs in a feed and place bids.
- Buyers compare bids and award to a seller.

## MVP roles
- BUYER: create RFQ, view bids, award
- SELLER: browse RFQs, place bids, dashboard
- ADMIN: optional prototype-only viewer

## Core MVP loop (must work end-to-end)
1) Buyer creates RFQ with required terms
2) Seller sees RFQ in feed
3) Seller places bid (terms auto-populated from RFQ)
4) Buyer views bids and awards a winner
5) RFQ status updates for everyone

## UI requirements (current decisions)
- Seller landing page buttons: “Browse Live Feed” and “View Dashboard”
- Bid screen header: “Place Bid for Request #<RFQ_NUMBER>”
  - Show buyer/company name under the header in smaller text
  - Remove “View Request” button
  - Quantity is a textbox input
  - Logistics/terms auto-populated from buyer RFQ template (read-only for MVP)

## Engineering standards
- TypeScript strict
- Validate inputs with zod at server boundaries
- Keep business logic out of UI components (put in /server)
- Use enums for roles/statuses
- Small incremental steps; app must run after each step

## Working style for Cursor
For any task:
1) Write a short plan
2) Implement in small steps
3) Run lint/typecheck after changes
4) Summarize what changed and what’s next
