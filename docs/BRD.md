# Real Estate Management Platform — Business Requirements

> Collected from the client BRD as pasted in chat (2026-10-29). Sections still to come are marked at the end.

## 1. Executive Summary

The objective of this project is to develop an integrated real estate management platform consisting of a public-facing website and a secure backend management system. The platform will support the client's core business activities:

1. Property sales and purchases.
2. Property rentals and leasing.
3. Online property listings and inquiries.
4. Customer and lead management.
5. Contract preparation, tracking, and renewal reminders.
6. Client payment management, including full payments, partial payments, and installments.
7. Automated payment reminders and overdue payment tracking.
8. Property inventory management, including publishing, archiving, and removal of properties.
9. Management reporting and business performance monitoring.

The platform will centralize property information, customer records, contracts, and financial transactions, reducing the need for separate spreadsheets, manual reminders, and disconnected applications. The public website will serve as the primary digital channel for property discovery and customer inquiries. The backend CMS and CRM will provide authorized staff with the tools to manage properties, customers, transactions, contracts, and payment obligations.

### 1.1 Project Objectives

- Establish a professional online presence for the real estate business.
- Enable visitors to browse available properties for sale, purchase, and rent.
- Provide search and filtering functionality to help visitors find suitable properties.
- Allow customers to submit inquiries regarding individual properties.
- Maintain a centralized property inventory.
- Track leads from initial inquiry through negotiation and transaction closure.
- Maintain customer records and communication history.
- Manage sales, purchase, rental, and lease contracts.
- Generate reminders for upcoming contract expirations and renewals.
- Record and monitor full, partial, and installment payments.
- Generate payment schedules and reminders.
- Track outstanding balances and overdue payments.
- Provide management with operational and financial reports.

## 2. Project Scope

| Component | Description |
|---|---|
| Public Real Estate Website | Public-facing website for browsing property listings and submitting inquiries. |
| Property Management CMS | Backend functionality for adding, editing, publishing, archiving, and removing property listings. |
| Lead Management CRM | Centralized management of inquiries, prospects, follow-ups, and sales opportunities. |
| Customer Management | Customer profiles containing contact information, inquiry history, contracts, and payment records. |
| Sales and Purchase Management | Management of property transactions, negotiations, agreements, and transaction status. |
| Rental and Lease Management | Management of rental properties, tenants, rental agreements, lease periods, and renewals. |
| Contract Management | Centralized contract records, contract documents, expiration dates, and renewal reminders. |
| Payment Management | Recording and tracking of full payments, partial payments, installments, and outstanding balances. |
| Reminder Management | Automated reminders for payments, overdue amounts, contract expirations, and follow-up activities. |
| Reporting and Analytics | Operational reports covering property inventory, leads, contracts, collections, and outstanding payments. |
| User and Access Management | Role-based access to administrative and operational functions. |

## 3. User Roles and Permissions

The system will provide role-based access to ensure that users can access only the information and functions authorized for their responsibilities.

### 3.1 Super Administrator

The Super Administrator will have complete access to the platform. Responsibilities and permissions:

- Create, edit, deactivate, and manage system users.
- Assign roles and permissions.
- Configure system settings.
- Manage property categories and listing attributes.
- View and manage all property records.
- Access all customer and lead records.
- View and manage contracts.
- Access payment records and financial reports.
- Configure reminder settings.
- Manage website content and general settings.
- View system-wide dashboards and reports.
- Access archived properties and historical records.

### 3.2 Business Administrator / Management

The Business Administrator or Management role will oversee real estate operations. Responsibilities and permissions:

- View overall business performance.
- Monitor property inventory and availability.
- View leads and sales opportunities.
- Monitor sales, purchases, and rental transactions.
- Review contract status and upcoming renewals.
- Monitor payment collections and outstanding balances.
- Review staff performance and activity reports.
- Approve designated transactions or adjustments, where required.
- Access management dashboards and business reports.

**Suggested restriction:** Financial adjustments, contract cancellations, and deletion of important records should require specific permissions rather than being available to every management user.

### 3.3 Property Manager

Responsibilities and permissions:

- Add new property records.
- Update property details.
- Upload property images and documents.
- Manage property availability and status.
- Publish and unpublish property listings, subject to assigned permissions.
- Archive inactive or unavailable properties.
- Review property inquiries.
- Assign or coordinate property viewings.
- Track property-related activities.
- View relevant contracts and payment information where authorized.

### 3.4 Sales and Rental Agent

Responsibilities and permissions:

- View assigned leads.
- Create new leads.
- Update lead status.
- Record customer requirements.
- Schedule follow-ups and property visits.
- Record customer interactions.
- Manage negotiations and transaction progress.
- Submit transaction details for approval.
- View assigned properties and their availability.
- View relevant customer and contract information according to permissions.

### 3.5 Accounts / Finance Officer

Responsibilities and permissions:

- View authorized customer and contract records.
- Create payment schedules.
- Record full and partial payments.
- Record installment payments.
- Generate payment receipts.
- Track outstanding balances.
- Identify overdue payments.
- Monitor upcoming payment due dates.
- Update payment records subject to access permissions.
- Generate payment and collection reports.

### 3.6 Contract / Legal Officer

Responsibilities and permissions:

- Create and maintain contract records.
- Upload signed contracts and supporting documents.
- Record contract start and end dates.
- Track renewal requirements.
- Monitor contract expiration dates.
- Update contract status.
- Record renewal, amendment, or termination details.
- View related customer and property information.
- Generate contract status reports.

### 3.7 Website Visitor

Public website visitors will be able to:

- Browse available property listings.
- Search for properties.
- Apply property filters.
- View property details and photographs.
- Submit inquiries.
- Request a property viewing.
- Provide contact details.
- Express interest in buying, selling, or renting a property.

Website visitors will not have access to the internal CMS, CRM, contracts, or financial records.

**Optional enhancement:** A customer portal may be introduced in a later phase to allow customers to view their contracts, payment schedules, receipts, and outstanding balances.

## 4. Public Website Requirements

### 4.1 Website Structure

| Page / Section | Purpose |
|---|---|
| Home Page | Introduce the real estate business and highlight featured properties. |
| Properties for Sale | Display properties available for sale. |
| Properties for Rent | Display properties available for rental. |
| Property Details | Present comprehensive information about an individual property. |
| Property Search | Allow visitors to search and filter available properties. |
| Sell Your Property | Allow property owners to submit their property details for consideration. |
| Property Inquiry | Enable visitors to contact the business regarding a property. |
| About Us | Present company information and business credentials. |
| Contact Us | Display contact information and an inquiry form. |
| Privacy Policy | Explain the handling of personal information. |
| Terms and Conditions | Present the applicable website terms. |

**Optional enhancement:** A separate property-purchase assistance page may be added if the client also assists customers in identifying and purchasing properties from third-party owners.

### 4.2 Property Categories

The system should support configurable property categories. Suggested categories: Residential; Commercial; Industrial; Agricultural; Land and plots; Other configurable categories.

Property subcategories may include: Houses; Apartments and flats; Villas; Offices; Shops; Warehouses; Commercial buildings; Residential plots; Commercial plots; Agricultural land.

Administrators should be able to maintain the categories and subcategories through the backend.

### 4.3 Property Listing Information

| Field | Description |
|---|---|
| Property ID | Unique system-generated property reference. |
| Property Title | Public-facing property name or headline. |
| Property Description | Detailed property description. |
| Property Category | Residential, commercial, land, or another configured category. |
| Property Type | House, apartment, office, plot, etc. |
| Transaction Type | Sale, rent, or another configured transaction type. |
| Listing Price | Asking price or rental amount. |
| Currency | PKR by default, with optional additional currencies. |
| Location | Country, city, area, and address. |
| Property Size | Land area or covered area. |
| Area Unit | Square feet, square yards, marla, kanal, or other configured units. |
| Bedrooms | Number of bedrooms, where applicable. |
| Bathrooms | Number of bathrooms, where applicable. |
| Floors | Number of floors, where applicable. |
| Furnishing Status | Furnished, semi-furnished, or unfurnished. |
| Property Features | Parking, lift, security, utilities, and other applicable features. |
| Images | Multiple property photographs. |
| Videos | Optional property videos. |
| Documents | Internal or public documents, subject to permissions. |
| Featured Status | Indicates whether the property should appear in featured sections. |
| Availability Status | Available, reserved, sold, rented, or another configured status. |
| Publication Status | Draft, published, archived, or unpublished. |
| Date Created | Record creation date. |
| Last Updated | Date of the most recent update. |

Some fields will be conditional depending on the property category. For example, bedroom and bathroom fields will generally apply to residential properties but may not apply to land or industrial properties.

### 4.4 Property Search and Filters

Website visitors should be able to search and filter listings by: sale or rental category; property type; city; area or locality; minimum price; maximum price; minimum and maximum property size; number of bedrooms; number of bathrooms; furnishing status; availability; selected property features.

Each listing in results should include: property photograph; property title; location; asking price or rental amount; property size; key property features; link to view full details.

The system should display an appropriate message when no matching properties are found.

### 4.5 Property Details Page

Each published property should have an individual details page displaying:

1. Property title.
2. Property photographs and image gallery.
3. Property description.
4. Property category and type.
5. Sale price or rental amount.
6. Location and address information approved for public display.
7. Property size.
8. Applicable property features.
9. Availability status.
10. Inquiry form.
11. Property viewing request option.
12. Business contact details.
13. Similar properties, if configured.

The system should generate a shareable URL for each published property.

**Suggested enhancement:** Implement SEO features, including configurable page titles, meta descriptions, image alt text, and structured property information.

### 4.6 Property Inquiry Form

Fields: customer name; mobile number; email address (where available); property reference; inquiry type; message or requirements; preferred contact method; preferred viewing date (if applicable).

Inquiry types: buying a property; renting a property; selling a property; general inquiry; requesting a property viewing.

**Business rules**

1. Every valid inquiry should generate a lead record in the CRM.
2. The system should associate the inquiry with the relevant property whenever applicable.
3. The system should record the inquiry date and source.
4. The system should notify the designated user or team of a new inquiry.
5. The CRM should allow the lead to be assigned to a sales or rental agent.
6. Duplicate inquiries from the same customer should be identifiable.
7. Invalid or incomplete submissions should be handled through appropriate validation.

### 4.7 Sell Your Property Form

Optional. Suggested fields: owner name; contact number; email address; property location; property category; property size; expected selling price; property description; property images; preferred contact time.

Submissions should enter the CRM as leads requiring review.

**Business rule:** A submitted property should not automatically become a publicly published listing. An authorized employee must review and approve the property before publication.

## 5. Property Management CMS

### 5.1 Property Creation

Authorized users should be able to:

1. Select the property category and type.
2. Enter property details.
3. Specify the transaction type.
4. Enter the asking price or rental amount.
5. Enter the property location.
6. Upload images and supporting documents.
7. Specify property availability.
8. Save the property as a draft.
9. Submit the property for approval, if an approval workflow is enabled.
10. Publish the property on the website.

The system should generate a unique Property ID for each record.

### 5.2 Property Editing

Authorized users should be able to update: descriptions; prices; location information; features; images and documents; availability status; publication status.

The system should record the date and user associated with significant updates.

**Suggested enhancement:** Maintain an audit history of price changes and availability updates so that management can investigate historical changes.

### 5.3 Property Publication Workflow

Draft → Under Review (optional) → Approved (optional) → Published → Unpublished / Archived / Sold / Rented

The exact workflow should be configurable. A property should be publicly visible only when:

- Its publication status is Published.
- Its required listing information is complete.
- It has not been removed from public display.
- It satisfies the configured visibility rules.

### 5.4 Property Archiving

Authorized users can archive properties no longer actively marketed (sold, rented, withdrawn by owners, no longer available, expired). Archived properties should not appear in active public listings; their history remains accessible to authorized users.

### 5.5 Property Removal and Deletion

| Action | Expected Behaviour |
|---|---|
| Unpublish | Remove the listing from the public website while retaining the property record. |
| Archive | Mark the property as inactive while preserving its history. |
| Mark as Sold | Update the status to Sold and remove it from active sale listings. |
| Mark as Rented | Update the status to Rented and remove it from active rental listings, subject to business rules. |
| Permanent Delete | Remove a record only when permitted by system rules and applicable retention requirements. |

**Important business rule:** Properties associated with active contracts, payment schedules, or financial transactions should not be permanently deleted through normal user operations. They should instead be archived or marked inactive.

### 5.6 Property Availability Management

Business status and website publication status are separate. For example: available but unpublished; published but reserved; sold and archived; rented while its historical lease remains active in the contract module.

Availability changes should be reflected on the website according to configured rules. The system should warn users when they attempt to create conflicting transactions for the same property.

## 6. CRM – Lead and Customer Management

### 6.1 Lead Management

Leads may originate from: property inquiry forms; property viewing requests; Sell Your Property submissions; telephone inquiries entered by staff; walk-in customers; direct agent referrals; other configured sources.

### 6.2 Lead Information

| Field | Description |
|---|---|
| Lead ID | Unique system-generated identifier. |
| Customer Name | Name of the prospect. |
| Mobile Number | Primary contact number. |
| Email | Email address, if available. |
| Lead Type | Buyer, seller, tenant, landlord, or other configured type. |
| Requirement Description | Customer's property requirements. |
| Preferred Location | Desired city or locality. |
| Property Category | Required property category. |
| Budget | Minimum and maximum budget, where applicable. |
| Associated Property | Relevant property reference, if applicable. |
| Lead Source | Website, phone, referral, walk-in, or another source. |
| Assigned Agent | Employee responsible for the lead. |
| Lead Status | Current position in the sales process. |
| Priority | Low, medium, high, or configurable priority. |
| Next Follow-up | Planned date and time for the next action. |
| Notes | Customer interaction notes. |
| Created Date | Date the lead was created. |

### 6.3 Lead Status Management

Configurable statuses. Suggested: New; Contact Attempted; Contacted; Qualified; Property Shortlisted; Viewing Scheduled; Viewing Completed; Negotiation; Proposal / Offer; Contract in Preparation; Won / Converted; Lost; On Hold.

### 6.4 Lead Assignment

Support: manual assignment; reassignment; lead ownership visibility; status tracking; follow-up reminders; identification of unassigned leads; monitoring of leads without recent activity.

**Suggested enhancement:** Configurable automatic lead assignment based on location, property category, agent availability, or workload.

### 6.5 Follow-up and Activity Management

Activity types: telephone calls; emails; meetings; property visits; negotiations; follow-up tasks; general notes. Each activity records its date, assigned employee, relevant lead or customer, and outcome. Users can schedule future follow-ups; the system displays overdue and upcoming follow-ups.

### 6.6 Lead Conversion

Authorized users can convert a lead into a customer or link it to an existing customer. Conversion retains: original lead information; associated property; lead source; agent assignment; interaction history; negotiation notes; transaction details. Avoid unnecessary duplication of customer records.

### 6.7 Customer Management

Each customer profile contains: Customer ID; name; contact details; customer category; address (where required); associated properties; lead and inquiry history; sales and purchase transactions; rental and lease agreements; contract documents; payment schedules; payment history; outstanding balances; notes and communication history.

Customer categories are configurable (buyers, sellers, tenants, landlords, investors, others). A single customer may have multiple properties, transactions, contracts, and payment schedules.

## 7. Sales and Purchase Transaction Management

### 7.1 Purpose

Manage property transactions from initial negotiation through contract execution and financial settlement, for properties owned by the client and properties marketed or brokered on behalf of third parties.

**Business clarification required:** The client should confirm whether it sells and purchases properties as the legal owner, acts as an intermediary for third-party transactions, or does both. This affects ownership records, payment handling, contract parties, and accounting requirements.

### 7.2 Transaction Record

Transaction ID; Property ID; transaction type (Sale or Purchase); buyer details; seller details; transaction date; agreed property price; currency; deposit or advance amount; payment terms; payment schedule; contract reference; responsible agent; transaction status; supporting documents; notes and remarks. Multiple parties may be associated with a transaction.

### 7.3 Transaction Statuses

Configurable. Suggested: Inquiry; Negotiation; Offer Submitted; Offer Accepted; Contract Preparation; Contract Signed; Payment in Progress; Completed; Cancelled; On Hold.

### 7.4 Transaction Workflow

1. A lead expresses interest in a property.
2. The agent contacts the customer.
3. Property requirements and availability are verified.
4. Negotiations take place.
5. The agreed commercial terms are recorded.
6. A transaction record is created.
7. The relevant contract is prepared and uploaded.
8. The contract is signed and its status is updated.
9. The payment schedule is created.
10. Payments are recorded against the transaction.
11. Outstanding amounts are monitored.
12. The transaction is marked completed when the configured completion requirements are satisfied.

Authorized users can manage exceptions, such as cancellations or revised payment terms.

### 7.5 Purchase Transactions

Where the client purchases a property, support: seller information; agreed purchase price; purchase agreement; advance payment; installment or settlement schedule; payment records; outstanding purchase obligations; completion status; supporting documents.

**Suggested enhancement:** If the client purchases properties for its own portfolio, maintain ownership acquisition dates and ownership status separately from website listing status.

## 8. Rental and Lease Management

### 8.1 Purpose

Manage properties offered for rent, tenant records, rental contracts, payment obligations, and contract renewals.

### 8.2 Rental Agreement Information

| Field | Description |
|---|---|
| Contract ID | Unique contract reference. |
| Property ID | Property covered by the agreement. |
| Landlord / Owner | Property owner or contracting party. |
| Tenant | Tenant associated with the agreement. |
| Contract Start Date | Date the agreement begins. |
| Contract End Date | Scheduled contract expiration date. |
| Monthly Rent | Agreed rental amount. |
| Security Deposit | Deposit amount, where applicable. |
| Advance Rent | Advance amount, where applicable. |
| Payment Frequency | Monthly, quarterly, annually, or another configured interval. |
| Payment Due Date | Date each rental payment is due. |
| Renewal Terms | Relevant renewal conditions or reference to the agreement. |
| Contract Document | Uploaded agreement or signed document. |
| Contract Status | Draft, active, expiring, expired, renewed, or terminated. |
| Responsible Employee | Staff member managing the agreement. |

### 8.3 Rental Agreement Workflow

1. A rental inquiry is received.
2. The agent qualifies the prospect.
3. Property availability is confirmed.
4. The tenant and landlord agree on commercial terms.
5. A rental agreement record is created.
6. The agreement document is uploaded.
7. Contract start and end dates are entered.
8. The rental payment schedule is configured.
9. The agreement is marked Active once the required conditions are satisfied.
10. Payment reminders are generated according to the schedule.
11. Renewal reminders are generated before the contract expires.
12. The contract is renewed, terminated, or marked Expired, as applicable.

### 8.4 Rental Renewal Management

Configurable reminders before expiry. Suggested intervals: 90, 60, 30 and 7 days before expiry, and on the expiration date.

Display: contract reference; property; tenant; contract end date; days remaining; renewal status; responsible employee; next action date.

Renewal statuses: Not Yet Contacted; Renewal Discussion; Renewal Proposed; Renewed; Not Renewing; Termination in Progress; Expired.

The system should retain the history of previous agreements and renewals.

**Important business rule:** Renewing a contract should not automatically overwrite its historical terms. The system should preserve the previous agreement and link it to the renewed agreement.

## 9. Contract Management

### 9.1 Purpose

A centralized repository for agreements associated with properties, customers, and transactions. Supported agreement types: sales agreements; purchase agreements; rental agreements; lease agreements; contract renewals; contract amendments; contract termination records; other configurable agreement types.

### 9.2 Contract Information

Each contract should contain: Contract ID; contract type; property reference; customer or contracting-party details; associated transaction; contract start date; contract end date (where applicable); contract value; payment terms; renewal terms; contract status; responsible employee; contract document; supporting documents; internal notes; creation date; last updated date.

Contracts can be associated with multiple relevant records, including properties, customers, transactions, and payment schedules.

### 9.3 Contract Statuses

Suggested: Draft; Under Review; Pending Signature; Active; Expiring Soon; Renewed; Expired; Termination in Progress; Terminated; Cancelled.

The system should support configurable status transitions.

### 9.4 Contract Document Management

Authorized users should be able to:

- Upload contract documents.
- Download documents according to permissions.
- Associate documents with the correct contract.
- Upload amended or renewed versions.
- Record relevant dates and notes.
- View document history where versioning is enabled.

Accepted formats: commonly used PDF and office document formats. The system should validate uploaded file types and sizes.

**Optional enhancement:** Contract templates and automatic document generation using approved templates populated with customer, property, and commercial details.

**Optional enhancement:** Electronic signatures through a suitable third-party service, if legally and operationally required.

## 10. Payment Management

- **10.1** Schedules, payments, outstanding amounts and due dates against properties, contracts, customers and transactions. Supports full, partial, installment, recurring rental, advance, security deposit and other obligations.
- **10.2** Schedule fields: ID, customer, property, contract/transaction reference, total payable, payment type, number of installments, installment amount, due dates, status, amount paid, outstanding balance, notes/terms. Rentals support recurring schedules by rental frequency.
- **10.3 Full payment:** one payment covering the total marks the obligation Paid. The transaction is Completed only when its other completion conditions are also met.
- **10.4 Partial payment:** multiple payments per obligation; outstanding calculated automatically; each payment keeps date, amount, method and reference.
- **10.5 Installments:** generate per schedule; modify when permitted; per-installment outstanding; multiple payments per installment; overdue tracking; upcoming/overdue reminders; overall balance per transaction/contract; prevent accidental duplicate schedules.
- **10.6 Payment recording:** payment ID, customer, property, contract/transaction, schedule/installment, date, amount, method, bank/transaction reference, receipt number, recorded by, notes, status. Methods: cash, bank transfer, cheque, pay order, online, other configurable.
- **10.7 Statuses:** Upcoming, Due, Partially Paid, Paid, Overdue, Cancelled, Disputed — from due date, amount received, outstanding balance and approved adjustments.
- **10.8 Receipts:** printable receipt per payment (receipt no., customer, property ref, contract/transaction ref, date, amount, method, reference, remaining balance, business details). **Rule:** generating a receipt never marks an obligation paid.
- **10.9 Revisions and reversals:** correct entry errors, reverse duplicates, record dishonoured cheques, cancel wrong payments — with permission and a reason; keep the original record in audit history.
- **10.10 Payment gateway:** not in default scope; online payment needs a separate gateway integration.

## 11. Automated Reminder Management

- **11.2 Categories:** upcoming payment, payment due, overdue payment, contract expiry, contract renewal, lead follow-up, property viewing, management escalation. Recipients (customer, finance, contract owner, agent, manager) and schedules are configurable.
- **11.3 Payment intervals:** 7 and 3 days before, on the due date, 3 and 7 days after, then escalation. Stop once fully paid; partial payments show the remaining amount.
- **11.4 Contract renewal intervals:** 90, 60, 30, 7 days before expiry and on expiry; record renewal actions and decisions.
- **11.5 Channels:** in-system (core scope), email, SMS, WhatsApp Business (need provider integration, templates, credentials and charges).
- **11.6 Logs:** reminder ID, category, related record, scheduled time, recipient, channel, status, sent time, error; distinguish scheduled, attempted and delivered.

## 12. Reporting

- **12.1 Dashboard:** total/available/for sale/for rent/sold/rented/archived properties; new leads; leads awaiting follow-up; active negotiations; transactions in progress; active rental contracts; contracts expiring soon; payments received; outstanding; overdue; upcoming obligations. Date filters where relevant.
- **12.2 Property reports:** inventory, available, by category, by location, for sale, for rent, sold, rented, archived, without recent updates, listing history.
- **12.3 CRM reports:** new leads by date, by source, by agent, by status; awaiting follow-up; overdue follow-ups; inquiries; viewing requests; conversion rate; lost leads and reasons; sales pipeline.
- **12.4 Contract reports:** active; expiring in a period; due for renewal; expired; renewed; terminated; by customer, property, responsible employee.
- **12.5 Payment reports:** received by date, customer, property, contract, transaction, method; outstanding; upcoming; overdue; partially paid; installment schedules; customer statements; collection summary for a period.
- **12.6 Export:** Excel, CSV, PDF where appropriate. Financial reports restricted by permission.

## 13. Business Rules

BR-01 unique Property ID · BR-02 unique Lead ID · BR-03 customer may link to many leads, properties, contracts, transactions · BR-04 only properties meeting publication and availability rules appear publicly · BR-05 archived properties hidden publicly but kept for authorized users · BR-06 every transaction linked to property and parties · BR-07 every contract has a unique ID and links to property, customer, transaction · BR-08 every schedule linked to customer and obligation · BR-09 outstanding = payable − recorded payments ± authorized adjustments · BR-10 multiple payments per obligation · BR-11 each installment keeps due date, amount, paid, outstanding, status · BR-12 reminders reflect actual outstanding and stop when settled · BR-13 contracts with end dates monitored · BR-14 renewals preserve history and link records · BR-15 actions limited to role permissions · BR-16 important changes logged · BR-17 payment records of completed transactions not deleted in routine operations · BR-18 transactions completed only when completion conditions are met · BR-19 identify potential duplicate customers and leads · BR-20 admins configure reminder intervals and recipients without code changes.

## 14. Non-Functional Requirements

- **14.1 Security:** secure authentication, RBAC, secure password storage, session management, protection against common web vulnerabilities, file upload validation, restricted customer/financial data, audit logs, safeguards for confidential documents; MFA may be introduced for privileged users.
- **14.2 Performance:** pages and common searches within ~3 seconds under normal conditions; background reminders must not affect users.
- **14.3 Availability:** target 99.5% monthly, excluding maintenance; final commitment per hosting agreement.
- **14.4 Responsive:** desktop, laptop, tablet, mobile for both website and admin; optimized mobile website.
- **14.5 Scalability:** listings, customers, leads, contracts, payments, users, locations, business branches, languages and currencies.
- **14.6 Backup and recovery:** automated DB backups, protected uploads, defined retention, recovery procedures and testing, restricted backup access; RTO/RPO agreed during implementation.
- **14.7 Auditability:** publication/archiving, price changes, contract create/modify, schedule changes, payment recording/reversal, permission changes, renewals/terminations — with user and timestamp.
- **14.8 Privacy:** restrict personal data to authorized staff; client defines retention and disclosure rules.

---

_Section 13 heading and any sections after 14 not yet received._
