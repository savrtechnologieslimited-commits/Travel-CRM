# Travel

Build a production-ready CRM and Travel Operations Management System for an Indian Travel Agency that handles both domestic Indian tourism and international/foreign tours.

The system should be designed for an Indian travel agency that receives leads from website, WhatsApp, phone calls, Instagram, Facebook, referrals, walk-ins, travel portals, and other sources, then converts those leads into enquiries, quotations, bookings, payments, itineraries, documents, and completed trips.

Do NOT build a generic CRM. Build a travel-industry-specific CRM with a clean, modern, fast interface.

1. CORE MODULES

Create these main modules:

Dashboard

Leads

Enquiries

Customers

Family / Travelling Groups

Quotations

Itineraries

Bookings

Suppliers / Vendors

Payments & Receivables

Documents

Tasks & Follow-ups

Communications

Tours / Packages

Reports & Analytics

Settings

Use a left sidebar navigation with clear icons and a top bar containing global search, notifications, quick-add button, and user profile.

2. DASHBOARD

Create a management dashboard showing:

Sales KPIs

New leads today

New enquiries this month

Active enquiries

Quotations sent

Quotations awaiting response

Confirmed bookings

Lost enquiries

Conversion rate

Total sales value

Pending customer payments

Supplier payments due

Expected revenue

Travel KPIs

Domestic bookings

International bookings

Upcoming departures

Trips currently in progress

Trips completed

Number of travellers

Popular destinations

Most profitable destinations

Follow-up section

Show:

Today's follow-ups

Overdue follow-ups

Upcoming follow-ups

High-priority leads

Upcoming trips

Display:

Customer

Destination

Departure date

Return date

Number of travellers

Booking status

Payment status

Assigned travel executive

Use charts for:

Leads by source

Leads → Enquiry → Quote → Booking funnel

Domestic vs International sales

Monthly revenue

Destination-wise sales

Sales executive performance

3. LEADS MODULE

Create a powerful lead management system.

Lead fields:

Lead ID

Lead date

Customer name

Mobile number

WhatsApp number

Email

Lead source

Source campaign

Domestic / International

Destination

Travel dates

Flexible dates toggle

Number of adults

Number of children

Number of infants

Budget

Currency

Trip type

Preferred hotel category

Preferred transport

Meal preference

Special requirements

Assigned sales executive

Lead priority

Lead status

Next follow-up

Notes

Lead sources:

Website

WhatsApp

Instagram

Facebook

Google

Referral

Walk-in

Phone

Existing Customer

Travel Portal

Corporate

Other

Lead statuses:

New
→ Contacted
→ Requirement Collected
→ Itinerary Preparing
→ Quotation Sent
→ Negotiation
→ Follow-up
→ Confirmed
→ Lost
→ Cancelled

Allow drag-and-drop Kanban view as well as table view.

Each lead should have a complete timeline showing:

Calls

WhatsApp messages

Emails

Notes

Follow-ups

Quotations

Payments

Booking changes

4. ENQUIRY MANAGEMENT

An enquiry should be created from a lead.

Create a detailed travel requirement form.

Trip details

Domestic / International

Destination

Multi-city destinations

Departure city

Arrival city

Departure date

Return date

Number of nights

Number of travellers

Adults

Children

Infants

Traveller preferences

Budget per person

Total budget

Hotel category

Room type

Meal plan

Transport type

Flight preference

Activity preferences

Sightseeing preferences

Honeymoon

Family

Couple

Solo

Group

Corporate

Religious

Adventure

Leisure

Luxury

Backpacking

Allow multiple destinations in one enquiry.

Example:

Hyderabad → Dubai → Abu Dhabi → Hyderabad

5. CUSTOMER MANAGEMENT

Create a 360° customer profile.

Customer fields:

Customer ID

Full name

Mobile

WhatsApp

Email

Date of birth

Nationality

Address

City

State

Country

Passport details

Passport expiry

PAN

GSTIN if applicable

Emergency contact

Preferences

Notes

Show:

Travel history

Every previous trip with:

Destination

Dates

Booking amount

Traveller count

Travel executive

Trip status

Customer value

Total bookings

Total revenue

Average booking value

Number of trips

Last trip

Upcoming trip

Allow customer segmentation:

New customer

Repeat customer

VIP

Corporate

Family

Honeymoon

High-value

6. FAMILY / TRAVELLING GROUPS

This is important for Indian travel agencies.

Allow multiple travellers to belong to one group/family.

Example:

Trip Group:
"Reddy Family – Singapore 2026"

Members:

Rajesh Reddy – Primary traveller

Sushma Reddy

Aarav Reddy

Ananya Reddy

Store individual traveller information including:

Name

DOB

Gender

Passport

Passport expiry

Nationality

Visa status

Meal preference

Special requirements

One primary customer should be responsible for communication and payment.

7. QUOTATION BUILDER

Create a professional quotation builder.

Allow sales executives to create quotations by adding:

Flights

Airline

Flight number

Sector

Date

Departure

Arrival

Cabin

Adult price

Child price

Infant price

Hotels

Hotel

City

Check-in

Check-out

Nights

Room category

Number of rooms

Meal plan

Supplier cost

Selling price

Transfers

Airport transfer

Private/shared

Vehicle type

Cost

Sightseeing

Activity

Date

Description

Adult price

Child price

Visa

Visa type

Visa fee

Service fee

Insurance

Provider

Coverage

Cost

Other services

Guide

Tickets

Meals

SIM

Currency

Other services

Automatically calculate:

Supplier Cost

Markup

Service Charges

Taxes
= Customer Selling Price

Show:

Total cost

Total selling price

Gross profit

Gross margin %

Per-person price

Allow multiple quotation versions:

Quote V1
Quote V2
Quote V3

Track which version was sent and which was accepted.

Quotation statuses:

Draft
→ Sent
→ Viewed
→ Negotiation
→ Accepted
→ Rejected
→ Expired

Generate a professional PDF quotation with the agency's branding.

8. ITINERARY BUILDER

Create a visual day-by-day itinerary builder.

Example:

DAY 1 – ARRIVAL IN DUBAI

Flight
Airport pickup
Hotel check-in
Evening leisure

DAY 2 – DUBAI CITY TOUR

Burj Khalifa
Dubai Mall
Marina
Dhow Cruise

Allow itinerary items to be reordered by drag-and-drop.

Each day should contain:

Date

City

Activities

Meals

Hotel

Transport

Pickup time

Drop time

Notes

Generate a customer-facing itinerary PDF.

9. BOOKING MANAGEMENT

Once quotation is accepted, convert it into a booking.

Booking fields:

Booking ID

Customer

Group

Destination

Travel dates

Number of travellers

Sales executive

Booking date

Total selling price

Amount received

Balance amount

Payment deadline

Booking status

Statuses:

Pending
Confirmed
Partially Confirmed
Fully Confirmed
Cancelled
Completed

Track each booking component separately:

Flight

Hotel

Transfer

Activity

Visa

Insurance

Other

Each component can have its own supplier, cost, confirmation number, and status.

10. SUPPLIER / VENDOR MANAGEMENT

Create supplier management for:

Hotels

Airlines

DMCs

Transport operators

Visa agencies

Activity providers

Tour operators

Guides

Insurance providers

Supplier fields:

Supplier name

Category

Contact person

Phone

WhatsApp

Email

Country

City

GSTIN

Bank details

Payment terms

Credit limit

Notes

Track:

Total bookings

Amount payable

Amount paid

Pending invoices

Supplier performance

11. PAYMENT MANAGEMENT

Support Indian payment methods:

UPI

Bank Transfer

Credit Card

Debit Card

Cash

Payment Gateway

Cheque

Also support multiple currencies for international bookings:

INR

USD

EUR

GBP

AED

SGD

AUD

THB

Other currencies

Store exchange rate used for each booking.

Track:

Customer Total
→ Advance Paid
→ Subsequent Payments
→ Balance

Show payment status:

Unpaid
Partially Paid
Paid
Refund Pending
Refunded

Generate payment receipts.

12. DOCUMENT MANAGEMENT

Create a document section for every booking.

Documents:

Passport

Visa

PAN

Aadhaar

Flight tickets

Hotel vouchers

Insurance

Booking confirmation

Payment receipt

Invoice

Travel itinerary

Visa application documents

Other

Allow upload, preview, download, expiry tracking, and document status.

Show alerts for:

Passport expiring soon

Visa pending

Missing documents

Documents awaiting verification

13. TASKS & FOLLOW-UPS

Create a CRM task system.

Every lead/enquiry/customer/booking can have tasks.

Task fields:

Task

Assigned employee

Due date

Priority

Related lead/customer/booking

Status

Notes

Task statuses:

Pending
In Progress
Completed
Overdue

Dashboard should prominently show today's and overdue follow-ups.

14. COMMUNICATIONS

Create a communication timeline.

Track:

Phone calls

WhatsApp

Email

SMS

Internal notes

For WhatsApp, design the system so it can later integrate with the WhatsApp Business API.

Create reusable message templates:

New enquiry acknowledgement

Quotation sent

Follow-up

Payment reminder

Booking confirmation

Travel reminder

Document reminder

Welcome message

Post-trip feedback

Birthday / anniversary

Repeat customer promotion

Do not fake WhatsApp API functionality. Create the integration-ready architecture.

15. TRAVEL PACKAGES

Create a package management module.

Package fields:

Package name

Destination

Domestic / International

Duration

Starting price

Description

Highlights

Inclusions

Exclusions

Hotel options

Activities

Transport

Images

Season

Active/inactive

Example packages:

Kerala 5N/6D
Dubai 5N/6D
Bali 6N/7D
Singapore 5N/6D
Rajasthan 6N/7D

Allow packages to be used directly while creating quotations.

16. DOMESTIC + INTERNATIONAL LOGIC

The CRM must distinguish between domestic and international travel.

Domestic

Track:

Train

Domestic flight

Bus

Cab

Hotel

Activities

Transfers

International

Track:

Passport

Visa

Forex

Travel insurance

International flights

Airport transfers

DMC

Immigration-related documents

Visa appointment

Visa status

International visa statuses:

Not Required
Required
Documents Pending
Documents Submitted
Appointment Scheduled
Under Processing
Approved
Rejected
Expired

17. INDIAN TAX / INVOICE SUPPORT

Build the financial architecture to support Indian travel businesses.

Support:

GSTIN

GST invoice

SAC

CGST

SGST

IGST

Service charges

Discounts

TCS where applicable

Foreign currency transactions

Credit notes

Refunds

Do NOT hard-code tax rates. Make tax configuration editable from Settings because applicable tax rules can change.

18. SALES TEAM MANAGEMENT

Create employee accounts with roles:

Admin
Manager
Sales Executive
Operations Executive
Accounts
Visa Executive
Read Only

Managers should be able to see team performance.

Sales executive dashboard:

My leads

My enquiries

My quotations

My bookings

Today's follow-ups

Pending payments

Conversion rate

Sales achieved

Revenue generated

19. AUTOMATIC WORKFLOWS

Create configurable automation rules.

Examples:

When a new lead is created:
→ Assign sales executive
→ Create first follow-up task
→ Send acknowledgement

When quotation is sent:
→ Set follow-up reminder

When quotation is accepted:
→ Create booking

When booking is confirmed:
→ Create document checklist

7 days before travel:
→ Send travel reminder

3 days before payment deadline:
→ Create payment reminder

After trip completion:
→ Create feedback task

30 days after trip:
→ Create repeat-customer follow-up.

Make automation rules configurable.

20. REPORTS

Create detailed reports:

Sales

Sales by employee

Sales by month

Sales by destination

Sales by source

Sales by package

Domestic vs international

Conversion

Lead conversion

Enquiry conversion

Quote conversion

Lost lead reasons

Finance

Revenue

Gross profit

Gross margin

Receivables

Supplier payables

Refunds

Customers

New customers

Repeat customers

Customer lifetime value

Most travelled customers

Allow filtering by:

Date
Employee
Destination
Domestic/International
Lead source
Booking status

Allow export to Excel/CSV/PDF.

21. GLOBAL SEARCH

Create a powerful global search.

Search across:

Customers

Leads

Bookings

Quotations

Invoices

Passport numbers

Mobile numbers

Booking IDs

Email

Destination

Example:

Searching "9849xxxxxx" should immediately show the associated customer, leads, bookings, quotations, payments and trips.

22. NOTIFICATIONS

Create notifications for:

New lead

New enquiry

Follow-up due

Follow-up overdue

Quotation accepted

Payment received

Payment overdue

Passport expiry

Visa update

Upcoming departure

Supplier payment due

23. UI / UX

The interface should look like a modern SaaS CRM.

Design principles:

Clean

Professional

Fast

Minimal clutter

Mobile responsive

Desktop optimized

Indian travel-industry appropriate

Use:

Cards

Tables

Kanban boards

Tabs

Status badges

Side drawers

Modal forms

Timeline components

Calendar

Charts

Avoid excessive animations.

Prioritize speed and usability.

24. BOOKING DETAIL PAGE

Create one powerful booking page.

Header:

BOOKING #TRV-2026-00124

Customer
Destination
Travel dates
Booking status
Payment status

Tabs:

Overview
Travellers
Itinerary
Flights
Hotels
Transfers
Activities
Visa
Insurance
Documents
Payments
Suppliers
Communications
Tasks
Timeline

The user should be able to manage the entire trip from this single screen.

25. CUSTOMER DETAIL PAGE

Create a 360° customer profile.

Header:

Customer Name
Phone
Email
Customer Type
Total Trips
Total Spend

Tabs:

Overview
Personal Details
Family
Travel History
Upcoming Trips
Enquiries
Quotations
Bookings
Payments
Documents
Communications
Notes

26. DATA MODEL

Create a properly relational database.

Core entities:

users
employees
roles
leads
enquiries
customers
travellers
travel_groups
destinations
packages
quotations
quotation_items
itineraries
itinerary_days
bookings
booking_items
flights
hotels
transfers
activities
suppliers
supplier_bookings
payments
refunds
invoices
documents
tasks
communications
visa_applications
insurance
notifications
audit_logs

Use proper foreign keys and relationships.

Every important record should have:

UUID/unique ID

created_at

updated_at

created_by

updated_by

Use soft deletion where appropriate.

27. SECURITY

Implement:

Authentication

Role-based access control

Row-level access where appropriate

Audit logs

Secure document access

Sensitive passport information protection

Secure payment records

Session management

Never expose passport/document data unnecessarily.

28. IMPORTANT UX REQUIREMENT

The workflow should feel like:

LEAD
↓
ENQUIRY
↓
REQUIREMENT
↓
ITINERARY
↓
QUOTATION
↓
NEGOTIATION
↓
CONFIRMATION
↓
BOOKING
↓
PAYMENTS
↓
DOCUMENTS
↓
TRAVEL
↓
COMPLETION
↓
FEEDBACK
↓
REPEAT CUSTOMER

Make this workflow visually obvious throughout the application.

29. QUICK ACTIONS

Add a global "+ Add" button with:

New Lead

New Customer

New Enquiry

New Quotation

New Booking

New Payment

New Task

Upload Document

30. DEMO DATA

Populate the application with realistic Indian travel agency demo data.

Create sample customers from:

Hyderabad
Mumbai
Delhi
Bangalore
Chennai
Ahmedabad

Create sample destinations:

Domestic:
Goa
Kerala
Rajasthan
Kashmir
Himachal Pradesh
Andaman
Uttarakhand

International:
Dubai
Abu Dhabi
Singapore
Malaysia
Thailand
Bali
Maldives
Europe
Australia
USA

Create realistic sample leads, quotations, bookings, payments, suppliers and upcoming trips.

31. IMPORTANT BUILD RULES

Do not build only static screens.

All major buttons should work.

CRUD operations must work.

Relationships between leads, customers, enquiries, quotations and bookings must work.

Example:

If a lead becomes a customer, do not create a disconnected duplicate customer.

If a quotation is accepted, it should convert into a booking while preserving the quotation history.

If a booking has multiple travellers, all travellers should remain connected to the booking.

If a customer has multiple trips, all trips should appear in their customer profile.

Maintain a complete audit/timeline history.

32. FIRST VERSION PRIORITY

If the entire system is too large to build in one pass, prioritize this order:

PHASE 1:
Dashboard
Leads
Customers
Enquiries
Follow-ups

PHASE 2:
Quotation Builder
Itinerary Builder
Bookings
Travellers

PHASE 3:
Payments
Invoices
Suppliers
Documents
Visa

PHASE 4:
Reports
Automation
WhatsApp integration
Advanced analytics

Build the architecture so Phase 2–4 can be added without rebuilding Phase 1.

The final result should feel like a purpose-built Indian Travel Agency operating system, not a generic CRM with travel fields added on top.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

The WhatsApp entry embeds the full, separate WACRM app in `apps/wacrm`.
Set `VITE_WACRM_APP_URL` in the CRM environment to the WACRM origin. Staff sign
in once in the embedded WACRM screen with their existing WACRM account; the
WACRM session is stored in a partitioned cookie for this CRM. When opening
WACRM's URL directly for the first time, use **Forgot password** to set a
password for an account previously provisioned through CRM sign-in. Public
account creation is disabled; new staff must be invited to the WACRM account.

CRM contact matching still uses the signed WACRM bridge. Configure the same
random `WACRM_BRIDGE_SECRET` in the CRM server environment and WACRM's
`apps/wacrm/.env.local`; generate it with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
Use a unique secret for this CRM/WACRM pair. The two apps keep separate
databases and passwords.

The CRM's native WhatsApp conversation dialog reads chat history directly
from WACRM's Supabase database (`contacts`, `conversations`, and `messages`).
In the CRM deployment's server-only environment, set `WACRM_SUPABASE_URL` to
WACRM's `NEXT_PUBLIC_WHATSAPP_SUPABASE_URL` and
`WACRM_SUPABASE_SERVICE_ROLE_KEY` to WACRM's `WHATSAPP_SUPABASE_SERVICE_ROLE_KEY`.
Set `WACRM_ACCOUNT_ID` to the UUID of the WACRM workspace linked to this CRM
company. The server uses this explicit workspace mapping, so CRM staff do not
need separate WACRM invitations. All contact and conversation queries remain
scoped to that account ID. Keep all three values server-only; never add a `VITE_`
prefix to the database credentials or account ID.

Customer greetings are sent by the WACRM account linked to the CRM. Apply
`20261004140000_customer_whatsapp_greeting_opt_in.sql` to the CRM Supabase
project. In WACRM, create an API key in **Settings → API keys** with only the
`messages:send` scope, then configure the following server-only values in the
CRM environment (never use a `VITE_` prefix for the API key):

```env
WACRM_API_KEY=
WACRM_GREETING_TEMPLATE_NAME=
WACRM_GREETING_TEMPLATE_LANGUAGE=en_US
```

Use a Meta-approved template synced in WACRM, with one body parameter
(`{{1}}`) for the customer's name. In the CRM's Add Customer form, select the
WhatsApp consent checkbox to save the opt-in and send the greeting after the
customer record is created. The form uses the WhatsApp number, falling back to
Mobile; bare 10-digit numbers are treated as Indian numbers. If WACRM rejects
the send, the customer remains saved and the CRM reports the failure.
Start both apps in separate terminals:

```sh
npm run dev:wacrm
npm run dev
```

Apply the WACRM bridge nonce migration in
`apps/wacrm/supabase/migrations` to the WACRM Supabase project before enabling
single sign-on or contact matching. Apply
`043_crm_contact_matching.sql` there to support exact email/phone lookups.
Apply `20261002220000_wacrm_contact_links.sql` from the CRM's
`supabase/migrations` directory to the CRM Supabase project to store
user-scoped record links. CRM lead/customer detail pages link only a unique
WACRM contact match; ambiguous or missing matches are not linked. WACRM remains
the separate Next.js app, so its screens and features can continue to evolve
independently. Do not point both apps at the same Supabase project if they are
meant to keep separate databases.

To record completed WACRM travel flows as customer requirements, apply
`20261004100000_wacrm_completed_flow_requirements.sql` to the CRM Supabase
project and `037_crm_flow_completion_outbox.sql` to WACRM's Supabase project.
When both apps are running on the same computer, set WACRM's
`TRAVEL_CRM_FLOW_SYNC_URL` to
`http://localhost:5173/api/wacrm/flow-completed` in WACRM's `.env.local`.
This local address is reachable only from this computer.

After deploying the Travel CRM to Vercel, open the WACRM Vercel project →
**Settings → Environment Variables** and set
`TRAVEL_CRM_FLOW_SYNC_URL` to
`https://YOUR-TRAVEL-CRM-DOMAIN/api/wacrm/flow-completed` (replace the
placeholder with the Travel CRM's real Vercel domain). Do not use
`localhost` in Vercel: from a Vercel server, localhost means that Vercel
server, not your computer. Keep the same private `WACRM_BRIDGE_SECRET` in
both Vercel projects, select Production (and Preview if needed), save, then
redeploy WACRM. The existing WACRM flow cron must continue to run on its
schedule; it securely retries completed-flow delivery. The CRM endpoint uses
the same `WACRM_BRIDGE_SECRET` already shared by both apps.
New completed flows match customers by WhatsApp phone or email; new contacts
create CRM customer records, and each flow run is saved separately. Customer
detail pages display numbered summaries in Overview and Requirements. Earlier
completed runs are included and delivered by the WACRM flow cron as well.

The WACRM visual Flow Builder also provides reusable **Travel CRM — Get
Destinations**, **Travel CRM — Get Destination**, and **Travel CRM — Complete
Enquiry** actions. These use the Travel CRM's existing signed integration;
destination records and PDFs remain owned by the Travel CRM. Configure the
server-only `TRAVEL_CRM_BASE_URL` and `WACRM_BRIDGE_SECRET` in WACRM, and apply
`apps/wacrm/supabase/migrations/045_travel_crm_flow_actions.sql` to WACRM's
Supabase project before saving flows that use the new actions. Apply
`supabase/migrations/20261005150000_wacrm_canonical_enquiries.sql` to the CRM
Supabase project so enquiry completion uses its canonical customer, lead, and
ENQ procedure. Send List supports dynamic item mappings and Send Media supports
variable-based URLs; existing static list and media configurations remain
supported.

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
