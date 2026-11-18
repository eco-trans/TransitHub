# TransitHub

TransitHub is an interactive dashboard for exploring long-term public transit on-time performance across cities, routes, and stops. It brings together historical real-time transit observations, geographic patterns, and temporal trends in one interface.

## Explore transit performance

- **Overview:** View citywide performance, select an area on the map, and explore trends, delay distributions, and observation coverage.
- **Route & stops:** Search routes by number or name, view stop-level performance, and follow performance from the first stop to the last for a selected direction and branch.
- **City comparison:** Compare cities over a shared date range using a map and sortable rankings for on-time performance, mean delay, data coverage, and observations.

Filter by city, date range, day type, and time period. Longitudinal charts overlay daily performance with weekly averages; weekday and hourly profiles summarize recurring patterns. 

## Metrics

| Metric | Definition |
| --- | --- |
| On-time performance | Percentage of valid observations with a delay between 60 seconds early and 300 seconds late, inclusive. |
| Mean delay | Observation-weighted average delay in minutes. Positive values indicate late service; negative values indicate early service. |
| Data coverage | Percentage of selected local dates with at least one observation. |
| Observations | Number of records contributing to the selected results. |

Weekly averages are weighted by observation counts, with weeks starting on Monday. Dates and hours use each city's local time zone. Coverage measures the availability of observations across dates.

## Data

TransitHub uses publicly available real-time transit data. All 14 cities include daily and hourly on-time performance down to individual stops. Delay distributions use one-minute intervals for cities, areas, routes, and directions. At a single stop, the chart uses ten delay bands. 


## Team and contact

Developed by **EcoTrans Lab and Luyu Liu**.

[Meet the team](https://luyuliu.github.io/) · [Contact](mailto:luyuliu@auburn.edu)

For questions, data corrections, or potential errors, contact **luyuliu@auburn.edu**.

© 2026 EcoTrans Lab, Luyu Liu.
