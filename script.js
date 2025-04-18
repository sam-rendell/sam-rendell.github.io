document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const DATA_URL = 'dprk_incident_map.json';
    const DEFAULT_TAB = 'overview';
    const TILE_LAYER_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'; // Dark theme tiles
    const TILE_LAYER_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

    // Color mappings (use CSS variables where possible, define fallbacks if needed)
    // We'll get the computed style later, but define the intended keys
    const LOSS_TYPE_COLOR_MAP = {
        'Financial Theft': 'var(--accent-green)',
        'Data Exfiltration (Espionage)': 'var(--accent-blue)',
        'Data Destruction': 'var(--accent-red)',
        'Disruption of Services': 'var(--accent-yellow)',
        'Intellectual Property Theft': 'var(--accent-purple)',
        'Reputational Damage': 'var(--text-medium)', // Use text-medium for less critical
        'Default': 'var(--text-disabled)'
    };
    const MITRE_TACTIC_ORDER = [ // For matrix columns
        'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution', 'Persistence',
        'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery',
        'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact'
    ];

    // --- CSS Variable Access ---
    // Function to get computed style (needed for JS-driven colors)
    function getCssVariable(variableName) {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    }

    // --- Force Chart.js Global Defaults for Dark Theme ---
    // Note: Direct use of CSS variables here might not work reliably in all contexts.
    // It's safer to get the computed style, but for simplicity in this static setup,
    // we'll set defaults using the intended color values from style.css.
    // If colors don't appear, replace 'var(--...)' with the actual hex/rgb codes.
    Chart.defaults.color = getCssVariable('--text-medium'); // Default text color
    Chart.defaults.borderColor = getCssVariable('--border-color'); // Default border color
    Chart.defaults.font.family = "'Poppins', sans-serif"; // Default font family
    Chart.defaults.font.size = 12;
    Chart.defaults.font.weight = '400';

    // Specific defaults (optional, as most should be inherited)
    Chart.defaults.scale.grid.color = getCssVariable('--border-color');
    Chart.defaults.scale.grid.drawBorder = false;
    Chart.defaults.scale.ticks.color = getCssVariable('--text-medium');
    Chart.defaults.plugins.legend.labels.color = getCssVariable('--text-light');
    Chart.defaults.plugins.legend.position = 'bottom';
    Chart.defaults.plugins.legend.align = 'start';
    Chart.defaults.plugins.tooltip.backgroundColor = getCssVariable('--bg-dark');
    Chart.defaults.plugins.tooltip.titleColor = getCssVariable('--accent-copper-light');
    Chart.defaults.plugins.tooltip.bodyColor = getCssVariable('--text-light');
    Chart.defaults.plugins.tooltip.borderColor = getCssVariable('--border-color-light');
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 3;
    Chart.defaults.plugins.tooltip.usePointStyle = true;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600', family: "'Poppins', sans-serif" };
    Chart.defaults.plugins.tooltip.bodyFont = { family: "'Poppins', sans-serif" };

    // --- DOM Elements ---
    const loadingIndicator = document.getElementById('loading');
    const errorIndicator = document.getElementById('error');
    const yearStartFilter = document.getElementById('year-start-filter');
    const yearEndFilter = document.getElementById('year-end-filter');
    const groupFilter = document.getElementById('group-filter');
    const sectorFilter = document.getElementById('sector-filter');
    const lossFilter = document.getElementById('loss-filter');
    const resetFiltersButton = document.getElementById('reset-filters');
    const statsTotalIncidents = document.getElementById('stat-total-incidents');
    const statsTotalLoss = document.getElementById('stat-total-loss');
    const statsTopGroup = document.getElementById('stat-top-group');
    const statsTopSector = document.getElementById('stat-top-sector');
    const timelineContainer = document.getElementById('timeline');
    const timelineEmptyMsg = timelineContainer.querySelector('.timeline-empty');
    const mapContainer = document.getElementById('map');
    const mapLegendContainer = document.getElementById('map-legend');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const overviewTimeChartCanvas = document.getElementById('overview-time-chart');
    const overviewGroupChartCanvas = document.getElementById('overview-group-chart');
    const overviewSectorChartCanvas = document.getElementById('overview-sector-chart');
    const overviewLossChartCanvas = document.getElementById('overview-loss-chart');
    const stackBySelect = document.getElementById('stack-by-select');
    const ttpTacticChartCanvas = document.getElementById('ttp-tactic-chart');
    const ttpTechniqueChartCanvas = document.getElementById('ttp-technique-chart');
    const mitreMatrixContainer = document.getElementById('mitre-matrix-container');
    const exportNavigatorButton = document.getElementById('export-navigator');
    const incidentTable = document.getElementById('incident-table'); // Direct reference to table
    const explorerIncidentCount = document.getElementById('explorer-incident-count');
    const viewTableBtn = document.getElementById('view-table-btn');
    const viewTimelineBtn = document.getElementById('view-timeline-btn');
    const explorerTableView = document.getElementById('explorer-table-view');
    const explorerTimelineView = document.getElementById('explorer-timeline-view');
    const incidentDetailModal = document.getElementById('incident-detail-modal');
    const modalContentContainer = document.getElementById('modal-incident-content');
    const modalCloseButton = document.querySelector('.modal-close-button');

    // --- State Variables ---
    let allIncidents = [];
    let filteredIncidents = [];
    let currentFilters = {
        startYear: 'all',
        endYear: 'all',
        group: 'all',
        sector: 'all',
        loss: 'all',
    };
    let activeTab = DEFAULT_TAB;
    let mapInstance = null;
    let mapMarkersLayer = null;
    let dataTableInstance = null;
    let chartInstances = {};
    let mitreTechniqueData = {};

    // Base coordinates (ensure these are up-to-date)
    const countryCoords = {
        "South Korea": [36.5, 127.5], "USA": [38, -97], "Vietnam": [16.16, 107.83],
        "Ecuador": [-1, -78], "Bangladesh": [24, 90], "Global": null,
        "Philippines": [13, 122], "Poland": [52, 20], "Mexico": [23, -102],
        "Uruguay": [-33, -56], "UK": [54, -2], "Spain": [40, -4],
        "France": [46, 2], "Russia": [60, 100], "Japan": [36, 138],
        "Slovenia": [46.15, 14.99], "Taiwan": [23.5, 121], "India": [20.59, 78.96],
        "Malta": [35.93, 14.5], "Singapore": [1.35, 103.81], "Canada": [56, -106],
        "Germany": [51.16, 10.45], "Indonesia": [-0.78, 113.92],
        "Slovakia": [48.66, 19.69], "Europe": null, "Asia": null,
        "USA/South Korea": [36.5, 127.5], "Guatemala": [15.78, -90.23]
    };

    // --- Helper Functions ---
    function formatCurrency(value) {
        if (value == null || isNaN(value)) return '--';
        if (value === 0) return '$0';
        if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
        if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
        if (value >= 1_000) return `$${Math.round(value / 1000)}K`;
        return `$${value.toLocaleString()}`; // Use localeString for commas
    }

    function formatDate(dateString, yearOnly) {
        if (yearOnly) return yearOnly.toString();
        if (!dateString) return 'Date Unknown';
        if (/^\d{4}$/.test(dateString)) return dateString;
        try {
            const date = new Date(dateString + 'T00:00:00Z');
            if (isNaN(date.getTime())) return yearOnly?.toString() || 'Date Unknown';
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
        } catch (e) {
            return yearOnly?.toString() || 'Date Unknown';
        }
    }

    function getLossTypeColor(lossType) {
        const cssVar = LOSS_TYPE_COLOR_MAP[lossType] || LOSS_TYPE_COLOR_MAP['Default'];
        return getCssVariable(cssVar.substring(4, cssVar.length - 1)); // Extract var name
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Initialization ---
    async function initialize() {
        try {
            showLoading();
            errorIndicator.style.display = 'none';

            // Set Chart.js defaults *after* CSS is likely loaded
            setChartDefaults();

            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();

            if (!data || !data.incidents) throw new Error("Invalid data format");
            allIncidents = data.incidents;

            allIncidents.sort((a, b) => {
                const yearA = a.temporal_info?.year || 0;
                const yearB = b.temporal_info?.year || 0;
                const dateA = a.temporal_info?.start_date || `${yearA}-01-01`;
                const dateB = b.temporal_info?.start_date || `${yearB}-01-01`;
                if (dateA < dateB) return -1;
                if (dateA > dateB) return 1;
                return yearA - yearB;
            });

            preProcessMitreData();
            populateFilters();
            setupEventListeners();
            initMap();
            initCharts(); // Init charts after defaults are set
            initTable();

            applyFiltersAndRender();
            activateTab(activeTab);

            hideLoading();

        } catch (err) {
            console.error("Initialization failed:", err);
            hideLoading();
            showError(`Error: ${err.message}. Could not load incident data.`);
        }
    }

    function setChartDefaults() {
        // Function to safely get CSS variable, falling back if necessary
        const safeGetCssVar = (name, fallback) => {
            try {
                return getCssVariable(name) || fallback;
            } catch (e) {
                console.warn(`Could not get CSS variable ${name}, using fallback ${fallback}`);
                return fallback;
            }
        };

        Chart.defaults.color = safeGetCssVar('--text-medium', '#aaaaaa');
        Chart.defaults.borderColor = safeGetCssVar('--border-color', '#444444');
        Chart.defaults.font.family = "'Poppins', sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.font.weight = '400';

        Chart.defaults.scale.grid.color = safeGetCssVar('--border-color', '#444444');
        Chart.defaults.scale.grid.drawBorder = false;
        Chart.defaults.scale.ticks.color = safeGetCssVar('--text-medium', '#aaaaaa');
        Chart.defaults.plugins.legend.labels.color = safeGetCssVar('--text-light', '#e0e0e0');
        Chart.defaults.plugins.legend.position = 'bottom';
        Chart.defaults.plugins.legend.align = 'start';
        Chart.defaults.plugins.tooltip.backgroundColor = safeGetCssVar('--bg-dark', '#121212');
        Chart.defaults.plugins.tooltip.titleColor = safeGetCssVar('--accent-copper-light', '#cc8f52');
        Chart.defaults.plugins.tooltip.bodyColor = safeGetCssVar('--text-light', '#e0e0e0');
        Chart.defaults.plugins.tooltip.borderColor = safeGetCssVar('--border-color-light', '#666666');
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 3;
        Chart.defaults.plugins.tooltip.usePointStyle = true;
        Chart.defaults.plugins.tooltip.boxPadding = 4;
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600', family: "'Poppins', sans-serif" };
        Chart.defaults.plugins.tooltip.bodyFont = { family: "'Poppins', sans-serif" };
    }


    function showLoading() { loadingIndicator.style.display = 'flex'; }
    function hideLoading() { loadingIndicator.style.display = 'none'; }
    function showError(message) { errorIndicator.textContent = message; errorIndicator.style.display = 'block'; }

    // --- Filter Population ---
    function populateFilters() {
        const years = new Set();
        const groups = new Set();
        const sectors = new Set();
        const lossTypes = new Set();

        allIncidents.forEach(inc => {
            if (inc.temporal_info?.year) years.add(inc.temporal_info.year);
            if (inc.attribution?.primary_group) groups.add(inc.attribution.primary_group);
            inc.targets?.forEach(t => { if (t.sector) sectors.add(t.sector); });
            inc.loss_events?.forEach(l => { if (l.loss_type) lossTypes.add(l.loss_type); });
        });

        const sortedYears = Array.from(years).sort((a, b) => a - b);
        const sortedGroups = Array.from(groups).sort();
        const sortedSectors = Array.from(sectors).sort();
        const sortedLossTypes = Array.from(lossTypes).sort();

        populateSelect(yearStartFilter, sortedYears, "Start");
        populateSelect(yearEndFilter, sortedYears.slice().reverse(), "End");
        populateSelect(groupFilter, sortedGroups, "All Groups");
        populateSelect(sectorFilter, sortedSectors, "All Sectors");
        populateSelect(lossFilter, sortedLossTypes, "All Loss Types");
    }

    function populateSelect(selectElement, optionsArray, defaultOptionText) {
        selectElement.innerHTML = `<option value="all">${defaultOptionText}</option>`;
        optionsArray.forEach(optionValue => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            selectElement.appendChild(option);
        });
        selectElement.value = 'all';
    }

    // --- Pre-process MITRE Data ---
    function preProcessMitreData() {
        mitreTechniqueData = {};
        allIncidents.forEach(inc => {
            inc.mitre_techniques?.forEach(tech => {
                const tactic = tech.tactic || 'Unknown Tactic';
                if (!mitreTechniqueData[tactic]) {
                    mitreTechniqueData[tactic] = [];
                }
                if (tech.technique_id && !mitreTechniqueData[tactic].some(t => t.id === tech.technique_id)) {
                    mitreTechniqueData[tactic].push({
                        id: tech.technique_id,
                        name: tech.technique_name || 'Unknown Technique'
                    });
                }
            });
        });
        for (const tactic in mitreTechniqueData) {
            mitreTechniqueData[tactic].sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        yearStartFilter.addEventListener('change', handleFilterChange);
        yearEndFilter.addEventListener('change', handleFilterChange);
        groupFilter.addEventListener('change', handleFilterChange);
        sectorFilter.addEventListener('change', handleFilterChange);
        lossFilter.addEventListener('change', handleFilterChange);
        resetFiltersButton.addEventListener('click', resetFilters);
        tabButtons.forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
        stackBySelect.addEventListener('change', () => updateOverviewCharts(filteredIncidents));
        viewTableBtn.addEventListener('click', () => switchExplorerView('table'));
        viewTimelineBtn.addEventListener('click', () => switchExplorerView('timeline'));
        modalCloseButton.addEventListener('click', hideIncidentDetailModal);
        incidentDetailModal.addEventListener('click', (event) => { if (event.target === incidentDetailModal) hideIncidentDetailModal(); });
        exportNavigatorButton.addEventListener('click', handleExportNavigator);
        window.addEventListener('resize', debounce(() => {
            Object.values(chartInstances).forEach(chart => chart?.resize());
            if (mapInstance) mapInstance.invalidateSize();
        }, 250));
    }

    function handleFilterChange() { applyFiltersAndRender(); }
    function resetFilters() {
        yearStartFilter.value = 'all';
        yearEndFilter.value = 'all';
        groupFilter.value = 'all';
        sectorFilter.value = 'all';
        lossFilter.value = 'all';
        applyFiltersAndRender();
    }

    // --- Core Filtering and Rendering Logic ---
    function applyFiltersAndRender() {
        currentFilters.startYear = yearStartFilter.value === 'all' ? -Infinity : parseInt(yearStartFilter.value);
        currentFilters.endYear = yearEndFilter.value === 'all' ? Infinity : parseInt(yearEndFilter.value);
        currentFilters.group = groupFilter.value;
        currentFilters.sector = sectorFilter.value;
        currentFilters.loss = lossFilter.value;

        if (currentFilters.endYear < currentFilters.startYear) {
            [currentFilters.startYear, currentFilters.endYear] = [currentFilters.endYear, currentFilters.startYear];
            [yearStartFilter.value, yearEndFilter.value] = [yearEndFilter.value, yearStartFilter.value];
            console.warn("End year was before start year, swapped.");
        }

        filteredIncidents = allIncidents.filter(inc => {
            const incidentYear = inc.temporal_info?.year;
            if (!incidentYear || incidentYear < currentFilters.startYear || incidentYear > currentFilters.endYear) return false;
            if (currentFilters.group !== 'all' && inc.attribution?.primary_group !== currentFilters.group) return false;
            if (currentFilters.sector !== 'all' && !inc.targets?.some(t => t.sector === currentFilters.sector)) return false;
            if (currentFilters.loss !== 'all' && !inc.loss_events?.some(l => l.loss_type === currentFilters.loss)) return false;
            return true;
        });

        updateSummaryStats(filteredIncidents);
        updateMapMarkers(filteredIncidents);
        updateOverviewCharts(filteredIncidents);
        updateTTPCharts(filteredIncidents);
        renderMitreMatrix(filteredIncidents);
        updateIncidentExplorer(filteredIncidents);
        renderActiveTabContent(); // Ensure active tab content is up-to-date
    }

    // --- Update Individual Components ---
    function updateSummaryStats(incidents) {
        statsTotalIncidents.textContent = incidents.length.toLocaleString(); // Add commas
        let totalLoss = incidents.reduce((sum, inc) => sum + (inc.loss_events?.reduce((incSum, l) => incSum + (l.estimated_value_usd || 0), 0) || 0), 0);
        statsTotalLoss.textContent = formatCurrency(totalLoss);

        const groupCounts = incidents.reduce((acc, inc) => { acc[inc.attribution?.primary_group || 'Unknown'] = (acc[inc.attribution?.primary_group || 'Unknown'] || 0) + 1; return acc; }, {});
        const topGroup = Object.entries(groupCounts).sort(([, a], [, b]) => b - a)[0];
        statsTopGroup.textContent = topGroup ? `${topGroup[0]} (${topGroup[1]})` : '--';

        const sectorCounts = incidents.reduce((acc, inc) => { inc.targets?.forEach(t => { acc[t.sector || 'Unknown'] = (acc[t.sector || 'Unknown'] || 0) + 1; }); return acc; }, {});
        const topSector = Object.entries(sectorCounts).sort(([, a], [, b]) => b - a)[0];
        statsTopSector.textContent = topSector ? `${topSector[0]} (${topSector[1]})` : '--';
    }

    function updateIncidentExplorer(incidents) {
        explorerIncidentCount.textContent = incidents.length.toLocaleString();
        updateIncidentTable(incidents);
        renderTimeline(incidents);
    }

    // --- Tab Management ---
    function activateTab(tabId) {
        activeTab = tabId;
        tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tab === tabId));
        tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === `tab-${tabId}`));
        renderActiveTabContent();
    }

    function renderActiveTabContent() {
        if (activeTab === 'map' && mapInstance) {
            setTimeout(() => mapInstance.invalidateSize(), 10);
        }
        // Charts and matrix are updated during applyFiltersAndRender
        // Just ensure the correct explorer view is shown
        if (activeTab === 'explorer') {
            const currentView = explorerTableView.classList.contains('active') ? 'table' : 'timeline';
            switchExplorerView(currentView);
        }
    }

    // --- Map Functions (Leaflet) ---
    function initMap() {
        if (!mapInstance) {
            mapInstance = L.map(mapContainer).setView([20, 0], 2);
            L.tileLayer(TILE_LAYER_URL, { maxZoom: 18, attribution: TILE_LAYER_ATTRIBUTION }).addTo(mapInstance);
            mapMarkersLayer = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 }).addTo(mapInstance); // Slightly larger radius
            mapInstance.attributionControl.setPrefix(false);
            populateMapLegend();
        }
    }

    function populateMapLegend() {
        let legendHTML = '<h4>Legend (Dominant Loss Type)</h4>';
        // Dynamically get used loss types AND their colors from CSS vars
        const lossTypesInUse = new Set(allIncidents.flatMap(inc => inc.loss_events?.map(l => l.loss_type)).filter(Boolean));
        Object.entries(LOSS_TYPE_COLOR_MAP).forEach(([type, cssVar]) => {
             if (lossTypesInUse.has(type) || type === 'Default') {
                const color = getCssVariable(cssVar.substring(4, cssVar.length - 1)); // Get actual color
                 legendHTML += `<div><span style="background-color:${color};"></span>${type}</div>`;
             }
        });
        mapLegendContainer.innerHTML = legendHTML;
    }

    function updateMapMarkers(incidents) {
        if (!mapInstance || !mapMarkersLayer) return;
        mapMarkersLayer.clearLayers();
        const incidentsByCountry = incidents.reduce((acc, inc) => {
            inc.targets?.forEach(target => {
                let country = target.country;
                if (country === "USA/South Korea") country = "South Korea";
                if (country && countryCoords[country]) {
                    if (!acc[country]) acc[country] = { count: 0, losses: {}, totalLossValue: 0, groups: {}, sectors: {} };
                    acc[country].count++;
                    inc.loss_events?.forEach(loss => {
                        const type = loss.loss_type || 'Unknown';
                        acc[country].losses[type] = (acc[country].losses[type] || 0) + 1;
                        if (loss.estimated_value_usd != null && !isNaN(loss.estimated_value_usd)) acc[country].totalLossValue += loss.estimated_value_usd;
                    });
                    const group = inc.attribution?.primary_group || 'Unknown';
                    acc[country].groups[group] = (acc[country].groups[group] || 0) + 1;
                    const sector = target.sector || 'Unknown';
                    acc[country].sectors[sector] = (acc[country].sectors[sector] || 0) + 1;
                } else if (country && !countryCoords[country] && !['Global', 'Europe', 'Asia'].includes(country)) {
                    console.warn(`Coordinates not found for country: ${country}`);
                }
            });
            return acc;
        }, {});

        const markers = [];
        Object.entries(incidentsByCountry).forEach(([country, data]) => {
            const coords = countryCoords[country];
            if (coords) {
                const dominantLossType = Object.entries(data.losses).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Default';
                const markerColor = getLossTypeColor(dominantLossType); // Use helper to get actual color
                const topGroup = Object.entries(data.groups).sort(([, a], [, b]) => b - a)[0]?.[0] || '--';
                const topSector = Object.entries(data.sectors).sort(([, a], [, b]) => b - a)[0]?.[0] || '--';

                const marker = L.circleMarker(coords, {
                    radius: 5 + Math.log(data.count + 1) * 3, // Slightly larger factor
                    fillColor: markerColor,
                    color: getCssVariable('--text-light'), // Light border
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.85 // Slightly more opaque
                }).bindPopup(`<b>${country}</b><br>Incidents: ${data.count}<br>Total Est. Loss: ${formatCurrency(data.totalLossValue)}<br>Dominant Loss: ${dominantLossType}<br>Top Group: ${topGroup}<br>Top Sector: ${topSector}`);

                marker.on('click', () => { filterExplorerByLocation(country, 'country'); activateTab('explorer'); });
                markers.push(marker);
            }
        });
        mapMarkersLayer.addLayers(markers);
    }

    function filterExplorerByLocation(value, type) { // type can be 'country' or 'technique' etc.
        let filtered;
        let filterDesc;
        if (type === 'country') {
            filtered = filteredIncidents.filter(inc => inc.targets?.some(t => { let targetCountry = t.country; if (targetCountry === "USA/South Korea") targetCountry = "South Korea"; return targetCountry === value; }));
            filterDesc = `by map: ${value}`;
        } else if (type === 'technique') {
            filtered = filteredIncidents.filter(inc => inc.mitre_techniques?.some(t => t.technique_id === value));
            filterDesc = `by TTP: ${value}`;
        } else {
            return; // Unknown filter type
        }
        updateIncidentExplorer(filtered);
        explorerIncidentCount.textContent = `${filtered.length} Incidents (filtered ${filterDesc})`;
        // Add a "clear map/TTP filter" button maybe? For now, applying global filters resets this.
    }

    // --- Chart Functions (Chart.js) ---
    function initCharts() {
        Object.values(chartInstances).forEach(chart => chart?.destroy());
        chartInstances = {};

        // Define common options merging with defaults
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    // Inherits position, align, font from defaults
                    labels: { boxWidth: 15, padding: 15 } // Keep specific layout tweaks
                },
                tooltip: { // Inherits most styling from defaults
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                             let value = null;
                             if(context.chart.options.indexAxis === 'y') {
                                value = context.parsed.x; // Horizontal bars
                             } else {
                                value = context.parsed.y; // Vertical bars/lines
                             }

                            if (value !== null) {
                                if (context.chart.id === overviewTimeChartCanvas.id && context.dataset.yAxisID === 'y_loss') {
                                    label += formatCurrency(value);
                                } else {
                                    label += value.toLocaleString(); // Format numbers with commas
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { // Inherits ticks, grid, title styling from defaults
                    title: { display: true } // Ensure title display is true
                },
                y: { // Inherits ticks, grid, title styling from defaults
                    title: { display: true }, // Ensure title display is true
                    beginAtZero: true
                }
            },
            animation: { duration: 400 }, // Faster animation
            hover: { mode: 'index', intersect: false },
            interaction: { mode: 'index', intersect: false }
        };

        // Overview - Time Chart
        chartInstances.overviewTime = new Chart(overviewTimeChartCanvas, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                ...commonOptions,
                scales: {
                    x: { ...commonOptions.scales.x, title: { ...commonOptions.scales.x.title, text: 'Year' } },
                    y_incidents: { type: 'linear', position: 'left', ...commonOptions.scales.y, title: { ...commonOptions.scales.y.title, text: 'Number of Incidents' } },
                    y_loss: { type: 'linear', position: 'right', ...commonOptions.scales.y, title: { ...commonOptions.scales.y.title, text: 'Estimated Loss (USD)' }, grid: { drawOnChartArea: false }, ticks: { ...commonOptions.scales.y.ticks, callback: value => formatCurrency(value), maxTicksLimit: 6 } }
                }
            }
        });

        // Helper for Bar Charts
        const createBarChart = (canvas, xAxisLabel, yAxisLabel, indexAxis = 'y') => new Chart(canvas, {
            type: 'bar',
            data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: [], borderWidth: 1, barPercentage: 0.8, categoryPercentage: 0.7 }] },
            options: {
                ...commonOptions,
                indexAxis: indexAxis,
                scales: {
                    x: { ...(indexAxis === 'y' ? commonOptions.scales.x : commonOptions.scales.y), title: { ...(indexAxis === 'y' ? commonOptions.scales.x.title : commonOptions.scales.y.title), text: xAxisLabel } },
                    y: { ...(indexAxis === 'y' ? commonOptions.scales.y : commonOptions.scales.x), title: { ...(indexAxis === 'y' ? commonOptions.scales.y.title : commonOptions.scales.x.title), text: yAxisLabel }, ticks: { autoSkip: false }, grid: { drawOnChartArea: (indexAxis === 'y') } }
                },
                plugins: { ...commonOptions.plugins, legend: { display: false } }
            }
        });

        // Init other charts
        chartInstances.overviewGroup = createBarChart(overviewGroupChartCanvas, 'Incident Count', 'Attacker Group', 'y');
        chartInstances.overviewSector = createBarChart(overviewSectorChartCanvas, 'Incident Count', 'Target Sector', 'y');
        chartInstances.overviewLoss = createBarChart(overviewLossChartCanvas, 'Incident Count', 'Loss Type', 'y');
        chartInstances.ttpTactic = createBarChart(ttpTacticChartCanvas, 'Frequency', 'Tactic', 'y');
        chartInstances.ttpTechnique = createBarChart(ttpTechniqueChartCanvas, 'Frequency', 'Technique', 'y');
    }

    // --- Update Chart Data Functions ---
    function updateOverviewCharts(incidents) {
        if (!chartInstances.overviewTime) return; // Guard against calls before init

        const stackByType = stackBySelect.value;
        const yearlyData = incidents.reduce((acc, inc) => { /* ... aggregation logic ... */
            const year = inc.temporal_info?.year; if (!year) return acc; if (!acc[year]) acc[year] = { count: 0, loss: 0, groups: {}, lossTypes: {} }; acc[year].count++; inc.loss_events?.forEach(l => { if (l.estimated_value_usd != null && !isNaN(l.estimated_value_usd)) acc[year].loss += l.estimated_value_usd; if (stackByType === 'loss_type') { const type = l.loss_type || 'Unknown'; acc[year].lossTypes[type] = (acc[year].lossTypes[type] || 0) + 1; } }); if (stackByType === 'primary_group') { const group = inc.attribution?.primary_group || 'Unknown'; acc[year].groups[group] = (acc[year].groups[group] || 0) + 1; } return acc;
        }, {});
        const sortedYears = Object.keys(yearlyData).map(Number).sort((a, b) => a - b);
        const timeLabels = sortedYears;
        const timeLossData = sortedYears.map(year => yearlyData[year].loss);
        const timeDatasets = [];

        // Loss Line Dataset
        timeDatasets.push({
            type: 'line', label: 'Estimated Loss', data: timeLossData,
            borderColor: getCssVariable('--accent-copper'), borderWidth: 2, tension: 0.3, yAxisID: 'y_loss',
            pointRadius: 3, pointBackgroundColor: getCssVariable('--accent-copper'), pointBorderColor: getCssVariable('--bg-dark'),
            pointHoverRadius: 6, pointHoverBackgroundColor: getCssVariable('--accent-copper-light'), pointHoverBorderColor: getCssVariable('--bg-dark'), fill: false
        });

        // Incident Bar Dataset(s)
        const accentGreen = getCssVariable('--accent-green');
        const accentGreenDark = getCssVariable('--accent-green-dark');
        const accentGreenHover = getCssVariable('--accent-green-hover');

        if (stackByType === 'none') {
            timeDatasets.push({
                type: 'bar', label: 'Incident Count', data: sortedYears.map(year => yearlyData[year].count),
                backgroundColor: accentGreen, borderColor: accentGreenDark, borderWidth: 1,
                hoverBackgroundColor: accentGreenHover, hoverBorderColor: accentGreenDark, yAxisID: 'y_incidents'
            });
            chartInstances.overviewTime.options.scales.y_incidents.stacked = false;
            chartInstances.overviewTime.options.plugins.legend.display = false;
        } else {
            const stackKey = stackByType === 'primary_group' ? 'groups' : 'lossTypes';
            const categories = Array.from(new Set(sortedYears.flatMap(year => Object.keys(yearlyData[year][stackKey])))).sort();
            const colorPalette = ['#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e74c3c', '#34495e', '#1abc9c', '#e67e22', '#bdc3c7', '#2c3e50']; // Explicit palette
            categories.forEach((category, index) => {
                const color = colorPalette[index % colorPalette.length];
                timeDatasets.push({
                    type: 'bar', label: category, data: sortedYears.map(year => yearlyData[year][stackKey][category] || 0),
                    backgroundColor: color, borderColor: Chart.helpers.color(color).darken(0.15).rgbString(), borderWidth: 1,
                    hoverBackgroundColor: Chart.helpers.color(color).lighten(0.1).rgbString(), hoverBorderColor: Chart.helpers.color(color).darken(0.15).rgbString(),
                    stack: 'incidents', yAxisID: 'y_incidents'
                });
            });
            chartInstances.overviewTime.options.scales.y_incidents.stacked = true;
            chartInstances.overviewTime.options.plugins.legend.display = true;
        }
        chartInstances.overviewTime.data.labels = timeLabels;
        chartInstances.overviewTime.data.datasets = timeDatasets;
        chartInstances.overviewTime.update();

        // Update Top Charts
        const updateTopChart = (chartInstance, dataCounts, baseColorVar) => {
            const sortedData = Object.entries(dataCounts).sort(([, a], [, b]) => b - a).slice(0, 12).reverse();
            chartInstance.data.labels = sortedData.map(item => item[0]);
            const dataset = chartInstance.data.datasets[0];
            dataset.data = sortedData.map(item => item[1]);

            if (chartInstance === chartInstances.overviewLoss) { // Use loss type specific colors
                 dataset.backgroundColor = sortedData.map(item => getLossTypeColor(item[0]));
                 dataset.borderColor = sortedData.map(item => Chart.helpers.color(getLossTypeColor(item[0])).darken(0.2).rgbString());
                 dataset.hoverBackgroundColor = sortedData.map(item => Chart.helpers.color(getLossTypeColor(item[0])).lighten(0.1).rgbString());
                 dataset.hoverBorderColor = sortedData.map(item => Chart.helpers.color(getLossTypeColor(item[0])).darken(0.2).rgbString());
            } else {
                 const color = getCssVariable(baseColorVar);
                 dataset.backgroundColor = color;
                 dataset.borderColor = Chart.helpers.color(color).darken(0.2).rgbString();
                 dataset.hoverBackgroundColor = Chart.helpers.color(color).lighten(0.1).rgbString();
                 dataset.hoverBorderColor = Chart.helpers.color(color).darken(0.2).rgbString();
            }
            chartInstance.update();
        };

        const groupCounts = incidents.reduce((acc, inc) => { acc[inc.attribution?.primary_group || 'Unknown'] = (acc[inc.attribution?.primary_group || 'Unknown'] || 0) + 1; return acc; }, {});
        updateTopChart(chartInstances.overviewGroup, groupCounts, '--accent-purple');

        const sectorCounts = incidents.reduce((acc, inc) => { inc.targets?.forEach(t => { acc[t.sector || 'Unknown'] = (acc[t.sector || 'Unknown'] || 0) + 1; }); return acc; }, {});
        updateTopChart(chartInstances.overviewSector, sectorCounts, '--accent-blue');

        const lossCounts = incidents.reduce((acc, inc) => { inc.loss_events?.forEach(l => { acc[l.loss_type || 'Unknown'] = (acc[l.loss_type || 'Unknown'] || 0) + 1; }); return acc; }, {});
        updateTopChart(chartInstances.overviewLoss, lossCounts, null); // Colors handled specially
    }

    function updateTTPCharts(incidents) {
         if (!chartInstances.ttpTactic || !chartInstances.ttpTechnique) return;

         const tacticCounts = {};
         const techniqueCounts = {};
         incidents.forEach(inc => { /* ... aggregation ... */
             inc.mitre_techniques?.forEach(tech => { const tactic = tech.tactic || 'Unknown Tactic'; const techniqueId = tech.technique_id || 'Unknown ID'; const techniqueName = tech.technique_name || 'Unknown Technique'; const techniqueLabel = `${techniqueId}: ${techniqueName.length > 35 ? techniqueName.substring(0, 32) + '...' : techniqueName}`; tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1; techniqueCounts[techniqueLabel] = (techniqueCounts[techniqueLabel] || 0) + 1; });
         });

         const updateTTPChart = (chartInstance, sortedData, colorVar) => {
             chartInstance.data.labels = sortedData.map(item => item[0]);
             const dataset = chartInstance.data.datasets[0];
             dataset.data = sortedData.map(item => item[1]);
             const color = getCssVariable(colorVar);
             dataset.backgroundColor = color;
             dataset.borderColor = Chart.helpers.color(color).darken(0.2).rgbString();
             dataset.hoverBackgroundColor = Chart.helpers.color(color).lighten(0.1).rgbString();
             dataset.hoverBorderColor = Chart.helpers.color(color).darken(0.2).rgbString();
             chartInstance.update();
         };

        const sortedTactics = Object.entries(tacticCounts).sort(([, a], [, b]) => b - a).slice(0, 15).reverse();
        updateTTPChart(chartInstances.ttpTactic, sortedTactics, '--accent-copper');

        const sortedTechniques = Object.entries(techniqueCounts).sort(([, a], [, b]) => b - a).slice(0, 15).reverse();
        updateTTPChart(chartInstances.ttpTechnique, sortedTechniques, '--accent-yellow');
    }


    // --- TTP Analysis Functions ---
    function renderMitreMatrix(incidents) {
        mitreMatrixContainer.innerHTML = '<p class="matrix-loading">Generating Matrix...</p>';

        const techniqueFrequency = {};
        let maxFrequency = 0;
        incidents.forEach(inc => {
            inc.mitre_techniques?.forEach(tech => {
                 if(tech.technique_id) {
                    techniqueFrequency[tech.technique_id] = (techniqueFrequency[tech.technique_id] || 0) + 1;
                    maxFrequency = Math.max(maxFrequency, techniqueFrequency[tech.technique_id]);
                 }
            });
        });

        if (maxFrequency === 0 && incidents.length > 0) { /* No techniques found */ mitreMatrixContainer.innerHTML = '<p class="matrix-loading">No MITRE techniques found for the selected incidents.</p>'; return; }
        if (incidents.length === 0) { /* No incidents selected */ mitreMatrixContainer.innerHTML = '<p class="matrix-loading">Select filters to generate matrix.</p>'; return; }

        let tableHTML = '<table class="mitre-matrix"><thead><tr>';
        const tacticsInOrder = MITRE_TACTIC_ORDER.filter(tactic => mitreTechniqueData[tactic]); // Only include relevant tactics
        tacticsInOrder.forEach(tactic => { tableHTML += `<th>${tactic}</th>`; });
        tableHTML += '</tr></thead><tbody>';

        let maxRows = 0;
        tacticsInOrder.forEach(tactic => { maxRows = Math.max(maxRows, mitreTechniqueData[tactic]?.length || 0); });

        const accentGreenRGB = '46, 204, 113'; // RGB for --accent-green (#2ecc71)

        for (let i = 0; i < maxRows; i++) {
            tableHTML += '<tr>';
            tacticsInOrder.forEach(tactic => {
                const technique = mitreTechniqueData[tactic]?.[i];
                if (technique) {
                    const freq = techniqueFrequency[technique.id] || 0;
                    const opacity = maxFrequency > 0 ? Math.max(0.15, freq / maxFrequency) : 0.15; // Scale opacity
                    const bgColor = freq > 0 ? `rgba(${accentGreenRGB}, ${opacity})` : 'transparent'; // Use RGB for alpha
                    const textColor = freq > 0 && opacity > 0.6 ? 'var(--text-dark)' : 'var(--text-light)'; // Dynamic text color

                    tableHTML += `<td class="technique-cell" style="background-color: ${bgColor}; color: ${textColor};" data-technique-id="${technique.id}" title="${technique.name} (ID: ${technique.id}) - Frequency: ${freq}"><span class="technique-name">${technique.name}</span><span class="technique-id">${technique.id}</span></td>`;
                } else {
                    tableHTML += '<td></td>';
                }
            });
            tableHTML += '</tr>';
        }
        tableHTML += '</tbody></table>';
        mitreMatrixContainer.innerHTML = tableHTML;

        // Add click listeners
        mitreMatrixContainer.querySelectorAll('.technique-cell[data-technique-id]').forEach(cell => {
             if (techniqueFrequency[cell.dataset.techniqueId] > 0) {
                cell.addEventListener('click', handleMatrixCellClick);
             } else {
                 cell.style.cursor = 'default';
                 cell.title = `${cell.querySelector('.technique-name').textContent} (ID: ${cell.dataset.techniqueId}) - Frequency: 0`; // Update title
             }
        });
    }

    function handleMatrixCellClick(event) {
        const cell = event.currentTarget;
        const techId = cell.dataset.techniqueId;
        if (!techId) return;
        filterExplorerByLocation(techId, 'technique');
        activateTab('explorer');
    }

    function handleExportNavigator() { /* ... function remains the same ... */
        const techLayer = generateNavigatorLayer(filteredIncidents);
        const blob = new Blob([JSON.stringify(techLayer, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        a.download = `dprk_incidents_navigator_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function generateNavigatorLayer(incidents) { /* ... function remains the same ... */
        const techniqueFrequency = {};
        let maxFrequency = 0;
         incidents.forEach(inc => { inc.mitre_techniques?.forEach(tech => { if(tech.technique_id) { techniqueFrequency[tech.technique_id] = (techniqueFrequency[tech.technique_id] || 0) + 1; maxFrequency = Math.max(maxFrequency, techniqueFrequency[tech.technique_id]); } }); });
         const scoreMin = 1; const scoreMax = Math.max(1, maxFrequency);
         const colorLow = '#ffffcc'; const colorHigh = '#e67e22'; // Use copper range end
         const techniques = Object.entries(techniqueFrequency).map(([techID, count]) => ({ techniqueID: techID, score: Math.max(1, Math.round(((count - scoreMin) / (scoreMax - scoreMin)) * 99) + 1), color: '', comment: `Frequency: ${count}`, enabled: true, metadata: [], showSubtechniques: false }));
         return {
            name: "DPRK Incident TTPs (Filtered)", versions: { "attack": "14", "navigator": "4.9.1", "layer": "4.5" }, domain: "enterprise-attack",
            description: `Techniques observed in filtered DPRK incidents. Score based on frequency (Max: ${maxFrequency}). Generated: ${new Date().toISOString()}`,
            filters: { "platforms": [ "Windows", "Linux", "macOS", "Network", "PRE", "Containers", "Office 365", "SaaS", "Google Workspace", "IaaS", "Azure AD" ] },
            sorting: 2, // Descending score
            layout: { "layout": "side", "aggregateFunction": "average", "showID": false, "showName": true, "showAggregateScores": false, "countUnscored": false },
            gradient: { "colors": [colorLow, colorHigh], "minValue": scoreMin, "maxValue": scoreMax },
            legendItems: [ { label: `Freq <= ${scoreMin}`, color: colorLow}, { label: `Freq >= ${scoreMax}`, color: colorHigh} ], techniques: techniques
         };
    }

    // --- Incident Explorer Functions ---
    function switchExplorerView(view) {
        explorerTableView.classList.toggle('active', view === 'table');
        explorerTimelineView.classList.toggle('active', view === 'timeline');
        viewTableBtn.classList.toggle('active', view === 'table');
        viewTimelineBtn.classList.toggle('active', view === 'timeline');
        if (view === 'table' && dataTableInstance) {
            dataTableInstance.columns.adjust().draw(); // Ensure table layout is correct
        }
    }

    function initTable() {
        if (!$.fn.dataTable.isDataTable('#incident-table')) {
            dataTableInstance = $(incidentTable).DataTable({
                data: [],
                columns: [
                    { data: 'temporal_info.year', title: "Year" },
                    { data: 'incident_name', title: "Incident Name", width: "25%" }, // Give more width
                    { data: 'attribution.primary_group', title: "Group", defaultContent: 'Unknown' },
                    { data: 'targets', title: "Sectors", orderable: false, render: targets => (targets?.map(t => t.sector || 'N/A').slice(0, 2).join(', ') || 'N/A') + (targets?.length > 2 ? '…' : '') },
                    { data: 'targets', title: "Countries", orderable: false, render: targets => (targets?.map(t => t.country || 'N/A').slice(0, 2).join(', ') || 'N/A') + (targets?.length > 2 ? '…' : '') },
                    { data: 'loss_events', title: "Loss Type", orderable: false, render: losses => losses?.[0]?.loss_type || 'N/A' },
                    { data: 'loss_events', title: "Est. Loss", type: 'num-fmt', render: losses => formatCurrency(losses?.reduce((sum, l) => sum + (l.estimated_value_usd || 0), 0)) },
                    { data: 'incident_id', title: "Details", orderable: false, searchable: false, className: 'dt-center', render: (data) => `<button class="details-btn" data-incident-id="${data}">View</button>` }
                ],
                order: [[0, 'desc']], pageLength: 25,
                language: { search: "", searchPlaceholder: "Search...", emptyTable: "No incidents match filters.", info: "Showing _START_ to _END_ of _TOTAL_ incidents", infoEmpty: "Showing 0 incidents", infoFiltered: "(filtered from _MAX_ total)" },
                dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" + "<'row'<'col-sm-12'tr>>" + "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>", // Standard Bootstrap layout
            });

            $('#incident-table tbody').on('click', 'button.details-btn', function () {
                const incidentId = $(this).data('incident-id');
                // Find incident in *filteredIncidents* not allIncidents
                const incidentData = filteredIncidents.find(inc => inc.incident_id === incidentId);
                if (incidentData) showIncidentDetailModal(incidentData);
                else console.error("Could not find filtered incident data for ID:", incidentId);
            });
        }
    }

    function updateIncidentTable(incidents) {
        if (!dataTableInstance) initTable();
        dataTableInstance.clear().rows.add(incidents).draw();
        dataTableInstance.columns.adjust(); // Re-adjust after drawing new data
    }

    function renderTimeline(incidents) {
        while (timelineContainer.firstChild && timelineContainer.firstChild !== timelineEmptyMsg) {
            timelineContainer.removeChild(timelineContainer.firstChild);
        }
        timelineContainer.classList.toggle('empty', incidents.length === 0);
        timelineEmptyMsg.style.display = incidents.length === 0 ? 'block' : 'none';

        if(incidents.length > 0) {
            const timelineHTML = incidents.map((inc, index) => {
                const side = index % 2 === 0 ? 'left' : 'right';
                const incidentDate = formatDate(inc.temporal_info?.start_date, inc.temporal_info?.year);
                const primaryTarget = inc.targets?.[0] ? `${inc.targets[0].sector || ''} (${inc.targets[0].country || ''})` : 'N/A';
                const primaryLoss = inc.loss_events?.[0] ? `${inc.loss_events[0].loss_type || ''} ${inc.loss_events[0].estimated_value_usd != null ? '('+formatCurrency(inc.loss_events[0].estimated_value_usd)+')' : ''}` : 'N/A';

                return `
                    <div class="timeline-item ${side}">
                        <div class="timeline-content" data-incident-id="${inc.incident_id}">
                            <span class="date">${incidentDate}</span>
                            <h3>${inc.incident_name || 'Unnamed Incident'}</h3>
                            <div class="timeline-summary">
                                <p><strong>Group:</strong> ${inc.attribution?.primary_group || 'Unknown'}</p>
                                <p><strong>Target:</strong> ${primaryTarget}</p>
                                <p><strong>Loss:</strong> ${primaryLoss}</p>
                                <p class="timeline-expand-prompt">Click to view details</p>
                            </div>
                        </div>
                    </div>`;
            }).join('');
            timelineContainer.insertAdjacentHTML('afterbegin', timelineHTML);

            timelineContainer.querySelectorAll('.timeline-content').forEach(item => {
                item.addEventListener('click', () => {
                    const incidentId = item.dataset.incidentId;
                    // Find incident in *filteredIncidents* not allIncidents
                    const incidentData = filteredIncidents.find(inc => inc.incident_id === incidentId);
                    if (incidentData) showIncidentDetailModal(incidentData);
                     else console.error("Could not find filtered incident data for ID:", incidentId);
                });
            });
        }
    }

    // --- Incident Detail Modal ---
    function showIncidentDetailModal(inc) { /* ... modal content generation remains the same ... */
        const aliasesHTML = inc.aliases?.length > 0 ? `<p><strong>Aliases:</strong> ${inc.aliases.join(', ')}</p>` : '';
        const campaignHTML = inc.campaign ? `<p><strong>Campaign:</strong> ${inc.campaign.campaign_name} (${inc.campaign.campaign_id})</p>` : '';
        const attributionHTML = inc.attribution ? `<div class="detail-section attribution-item"><h4>Attribution</h4><p><strong>Group:</strong> ${inc.attribution.primary_group || 'N/A'}${inc.attribution.sub_groups?.length > 0 ? ` (Subgroups: ${inc.attribution.sub_groups.join(', ')})` : ''}<br><strong>Confidence:</strong> ${inc.attribution.confidence || 'N/A'}${inc.attribution.attribution_notes ? `<br><em>Notes: ${inc.attribution.attribution_notes}</em>` : ''}</p></div>` : '<p>No attribution details.</p>';
        const targetsHTML = inc.targets?.length > 0 ? `<div class="detail-section"><h4>Targets</h4><ul>${inc.targets.map(t => `<li class="target-item"><span class="target-sector">${t.sector || 'N/A'}</span>${t.country ? `<span class="target-country"> (${t.country})</span>` : ''}${t.entity_name ? `<span class="target-entity">Entity: ${t.entity_name}</span>` : ''}${t.description ? `<span class="target-entity">Desc: ${t.description}</span>` : ''}</li>`).join('')}</ul></div>` : '<p>No target details.</p>';
        const lossEventsHTML = inc.loss_events?.length > 0 ? `<div class="detail-section"><h4>Loss Events</h4><ul>${inc.loss_events.map(l => `<li class="loss-item"><span class="loss-type">${l.loss_type || 'N/A'}</span>${l.estimated_value_usd != null ? `<span class="loss-value"> (${formatCurrency(l.estimated_value_usd)})</span>` : ''}: ${l.description || 'N/A'}</li>`).join('')}</ul></div>` : '<p>No loss event details.</p>';
        const malwareToolsHTML = inc.malware_tools?.length > 0 ? `<div class="detail-section"><h4>Malware / Tools</h4><ul>${inc.malware_tools.map(tool => `<li class="malware-item"><code>${tool || 'N/A'}</code></li>`).join('')}</ul></div>` : '<p>No malware/tool details.</p>';
        const mitreHTML = inc.mitre_techniques?.length > 0 ? `<div class="detail-section"><h4>MITRE ATT&CK Techniques</h4><ul>${inc.mitre_techniques.map(tech => `<li class="mitre-item"><a href="https://attack.mitre.org/techniques/${tech.technique_id}/" target="_blank" rel="noopener noreferrer" class="mitre-link">${tech.technique_id || 'N/A'}</a>: ${tech.technique_name || 'N/A'}${tech.tactic ? `<span class="mitre-tactic">(${tech.tactic})</span>` : ''}</li>`).join('')}</ul></div>` : '<p>No MITRE technique details.</p>';
        const referencesHTML = inc.references?.length > 0 ? `<div class="detail-section"><h4>References</h4><ul>${inc.references.map(ref => `<li class="reference-item"><a href="${ref.url || '#'}" target="_blank" rel="noopener noreferrer" class="reference-link">${ref.title || ref.url || 'Link'}</a>${ref.source ? `<span class="reference-source">[${ref.source}]</span>` : ''}${ref.publication_date ? `<span class="reference-date">(${ref.publication_date})</span>` : ''}</li>`).join('')}</ul></div>` : '<p>No reference details.</p>';
        const notesHTML = inc.notes ? `<div class="detail-section notes"><h4>Notes</h4><p>${inc.notes}</p></div>` : '';

        modalContentContainer.innerHTML = `<h3>${inc.incident_name || 'Unnamed Incident'}</h3><p><strong>ID:</strong> ${inc.incident_id}</p><p><strong>Date:</strong> ${formatDate(inc.temporal_info?.start_date, inc.temporal_info?.year)}</p>${aliasesHTML}${campaignHTML}<h4>Description</h4><p>${inc.description || 'No description.'}</p>${attributionHTML}${targetsHTML}${lossEventsHTML}${malwareToolsHTML}${mitreHTML}${referencesHTML}${notesHTML}`;
        incidentDetailModal.style.display = "block";
        document.body.style.overflow = 'hidden'; // Prevent body scroll
    }

    function hideIncidentDetailModal() {
        incidentDetailModal.style.display = "none";
        modalContentContainer.innerHTML = "";
        document.body.style.overflow = ''; // Restore body scroll
    }

    // --- Start the application ---
    initialize();
});

