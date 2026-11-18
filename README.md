# TransitHub

TransitHub is an interactive dashboard for exploring long-term public transit on-time performance across cities, routes, and stops. It brings together historical real-time transit observations, geographic patterns, and temporal trends in one interface.

## Explore transit performance

- **Overview:** View citywide performance, select an area on the map, and explore trends, delay distributions, and observation coverage.
- **Route & stops:** Search routes by number or name, view stop-level performance, and follow performance from the first stop to the last for a selected direction and branch.
- **City comparison:** Compare cities over a shared date range using a map and sortable rankings for on-time performance, mean delay, data coverage, and observations.

Filter by city, date range, day type, and time period. Longitudinal charts overlay daily performance with weekly averages; weekday and hourly profiles summarize recurring patterns. Copy the address bar URL to share the current view and its settings, or export the selected results as CSV.

## Metrics

| Metric | Definition |
| --- | --- |
| On-time performance | Percentage of valid observations with a delay between 60 seconds early and 300 seconds late, inclusive. |
| Mean delay | Observation-weighted average delay in minutes. Positive values indicate late service; negative values indicate early service. |
| Data coverage | Percentage of selected local dates with at least one observation. |
| Observations | Number of records contributing to the selected results. |

Weekly averages are weighted by observation counts, with weeks starting on Monday. Dates and hours use each city's local time zone. Coverage measures the availability of observations across dates, rather than the proportion of scheduled service operated.

## Data

TransitHub uses publicly available real-time transit data organized through [GTFS-UI](https://github.com/eco-trans/GTFS-UI). All 14 cities include daily and hourly on-time performance down to individual stops. Delay distributions use one-minute intervals for cities, areas, routes, and directions. At a single stop, the chart uses ten delay bands. All performance data are included in the site; route details load when a route is selected.

## Data availability and use

Within each city’s data folder, route filenames include the route name, source ID, and file purpose. Analysis areas are labeled by a nearby stop when available. The stop is a location reference, not an official area name. The manifest maps source IDs to files so shared links can continue to use stable IDs.

City coverage, date ranges, and detail vary with source-feed availability and processing status. Feed interruptions, missing records, and reporting errors can affect the estimates. Missing observations do not establish that service was not operated.

Results are provided for research and informational use, without warranties of accuracy, completeness, or continued availability. To the extent permitted by applicable law, the project contributors disclaim liability for losses arising from use of the data or results.

## Team and contact

Developed by **EcoTrans Lab and Luyu Liu**.

[Meet the team](https://luyuliu.github.io/) · [Contact](mailto:luyuliu@auburn.edu)

For questions, data corrections, or potential errors, contact **luyuliu@auburn.edu**.

© 2026 EcoTrans Lab, Luyu Liu.
