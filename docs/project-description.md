# Project description

## Problem:
The company Lakeside Provisions is a mid-size retailer and has given me a CSV file exported from their order system, and that's all they gave me.

My task is to create an app where a consultant can drop in a client file and get an honest first read on what's in it — what the data looks like, what looks wrong, and what they should ask the client about.

## Requierements:
- The Web app must run on React/Tailwind CSS, be completely responsive, and the interface must follow the best and most recent UX/UI practices.
- It must run in the browser, without needing to install anything else, so it can run in any JS compatible browser, wether it's mobile or desktop.
- It has to be able of reading CSV, TSV, XLS, XLSX and SQL files, extract the records and work on them using Arquero for JS.

## Expected outcome:
A React web application that does four things:
1. Takes a CSV. Uploaded in the browser. It should work on any reasonable dataset, not only Lakeside's.
2. Analyzes the dataset in code. Real computation over the actual data: what the columns are, what's missing, what's duplicated, what's inconsistent, what looks out of place.
3. Uses an LLM to generate a data dictionary, explaining the meaning of the variables and the structure of the dataset.
4. Uses an LLM to understand the business and offer KPIs, insights, and actionable recommendations about it, based on the information extracted from the clean dataset.
5. Uses an LLM to suggest that the consultant might ask to the customer about their business.
6. Presents the result well. The customer's IT manager should be able to open the app and understand what's in their data and what they should be worried about — without knowing what a null value is. Not a table dump: an assessment.

`Keep it simple. No authentication, no database, no backend service, nothing deployed — a React app running locally is exactly right. Something small and finished beats something ambitious and half-working, and choosing what to leave out is part of the work.´

## Summarized description:
A React/Tailwind web app that helps consultants rapidly extract, transform, and analyze raw datasets to uncover business KPIs, insights, actionable recommendations, and strategic questions for clients.