I want the UX/UI to feel like a data analysis dashboard. In order to achieve this we'll need two major changes:
1. The web interface must be made of two areas being the accesses area on the top and left bars, and the interaction area on the center viewport. For mobiles, the left sidebar will be collapsible.
2. The LLMs queries will run all automatically upon file uploading, one after the other, each one of them receiving feedback from the previous "analysis" step (ETL (without actually loading it anywhere else than the local storage) & EDA), this way, the LLMs will have the exact context to generate the best possible information.

The top bar will have the system's Logo and title on the left corner (logo only for mobile), and the rest of the bar will contain the KPI cards. Consider these cards will not be about the data itself but the information this data conveys about the business, so they are business-related and business-significant. To the right of the top bar, there will be a History button (clock with counter-clockwise arrow). When pressed, a right sidebar will roll in, and show a history of analyzed datasets.

The left bar will have two main sections: business information and data.
Under business information there will be: Dashboard, Explanation, Business Insights, Questions.
Under data ther will be: Overview, Data Dictionary, Quality, Datasets.

- Business Information
1. Dashboard: This will be a full-fledged interactive data analysis dashboard, adapted to the business. Showing KPIs, notices, quick insights and graphs. It must have filters which affect every piece of information shown in it.
2. Explanation: This is mostly text-based, it's a simple yet comprehensive explanation of the information extracted from the dataset, such as Business model, business healt status, what's good, and the most important points to consider in order to improve.
3. Business Insights: In this section, the user can see Business Insight cards, with its title, description, importance, and tags. The user should be able to filter them by tags or importance, and sort them by importance.
4. Questions: Here the user will access the questions the LLM suggest to the customer. This will also have tags and importance, so the user can filter/sort them better.

- Data
1. Overview: This will contain the Dataset Overview and Column detail that currently exist in the MVP.
2. Data Dictionary: Here the user will find the data dictionary explaining the meaning of each field in the dataset.
3. Quality: Here will be the data quality summary currently existing in the MVP. But additionally, there will be a more explanatory section of quality issues encountered in the dataset and how they were managed by the system. The idea of this is that if a Data Analyst checks it, they will understand the reason behind every modification to the raw dataset.
4. Datasets: This section will contain a side-by-side comparison between the raw dataset and the cleaned and normalized one. Only the first 50 lines of each are visible, but they're both fully downloadable from here.

- History sidebar: Here the user will be able to see the datasets they have uploaded so far. There will be a "Delete" button to the right of each, and a "New dataset" button at the top. If every dataset is deleted, the sidebar will collapse automatically and the "Upload a dataset" modal will pop up.

The user path is like this:
1. The user opens the web app.
2. A popup modal appears, indicating to upload the dataset file.
3. Once the user uploads the file, everything locks under a loading overlay with a spinner and a text line.
4. The spinner spins while the system processes the dataset, the text line reflects the current status of the process (something like: understandig data, cleaning data, generating KPIs, explaining business insights... etc.)
5. When the process is completed, the dashboard loads up, showing the graphs and eveything, and the KPI cards can be seen on the top bar, and the History button on the right side of the top bar becomes visible.
6. At the bottom area of the left bar, two buttons will appear: Download PDF Report, Upload new dataset.
7. The user can now browse the entire system, completely fed with the information.

Important consideration: All the information remains stored in localstorage, so the user can close the tab and open it once again, and everything will be loaded without any new queries. The "Upload a dataset" modal will only pop up if there's no dataset in the history.