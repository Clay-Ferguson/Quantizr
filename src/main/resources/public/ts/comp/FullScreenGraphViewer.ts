import * as d3 from "d3";
import { getAppState } from "../AppContext";
import { Div } from "../comp/core/Div";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { Main } from "./Main";

// https://observablehq.com/@d3/force-directed-tree
// https://www.npmjs.com/package/d3
// https://d3js.org/

export class FullScreenGraphViewer extends Main {
    simulation: any;
    tooltip: any;
    isDragging: boolean;

    preRender(): void {
        this.setChildren([new Div(null, { className: "d3Graph" })]);
    }

    domPreUpdateEvent = () => {
        const appState = getAppState();
        if (!appState.graphData) return;
        const customForceDirectedTree = this.forceDirectedTree();

        d3.select(".d3Graph")
            .datum(appState.graphData)
            .call(customForceDirectedTree);
    }

    forceDirectedTree = () => {

        // todo-0: use fat arrows on functions and get rid if 'thiz'
        const thiz = this;
        const appState = getAppState();
        const nodeId = appState.fullScreenConfig.nodeId;

        return function (selection: any) {
            const margin = { top: 0, right: 0, bottom: 0, left: 0 };
            const width = window.innerWidth;
            const height = window.innerHeight;

            const data = selection.datum();
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;

            const root = d3.hierarchy(data);
            const links: any = root.links();
            const nodes: any = root.descendants();

            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(function (d: any) { return d.id; }).distance(0).strength(1))
                .force("charge", d3.forceManyBody().strength(-50))
                .force("x", d3.forceX())
                .force("y", d3.forceY());

            thiz.tooltip = selection
                .append("div")
                .attr("class", "tooltip alert alert-secondary")
                .style("font-size", "14px")
                .style("pointer-events", "none");

            const drag = function (simulation: any) {
                return d3.drag()
                    .on("start", function (event: any, d: any) {
                        thiz.isDragging = true;
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on("drag", function (event: any, d: any) {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on("end", function (event: any, d: any) {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                        thiz.isDragging = false;
                    });
            };

            let svg = selection
                .selectAll("svg")
                .data([data])
                .enter()
                .append("svg")
                .attr("width", chartWidth)
                .attr("height", chartHeight)
                .style("cursor", "move")
                .attr("viewBox", [-window.innerWidth / 2, -window.innerHeight / 2, window.innerWidth, window.innerHeight]);
            svg = svg.merge(svg);
            const g = svg.append("g");

            const link = g.append("g")
                .attr("stroke", "#999")
                .attr("stroke-width", 1.5)
                .attr("stroke-opacity", 0.6)
                .selectAll("line")
                .data(links)
                .join("line");

            const node = g.append("g")
                .attr("stroke-width", 1.5)
                .style("cursor", "pointer")
                .selectAll("circle")
                .data(nodes)
                .join("circle")

                .attr("fill", function (d: any) {
                    let color = "black";
                    if (d.data.id === nodeId) {
                        color = "red";
                    }
                    else if (d.data.highlight) {
                        color = "green";
                    }
                    return color;
                })
                .attr("stroke", function (d: any) {
                    return thiz.getColorForLevel(d.data.level);
                })
                .attr("r", function (d: any) {
                    if (d.data.id === nodeId) return 5;
                    return 3.5;
                })

                .on("mouseover", function (event: any, d: any) {
                    if (d.data.id.startsWith("/")) {
                        thiz.updateTooltip(d, event.pageX, event.pageY);
                    }
                    else {
                        thiz.showTooltip(d, event.pageX, event.pageY);
                    }
                })
                .on("mouseout", function () {
                    thiz.tooltip.transition()
                        .duration(300)
                        .style("opacity", 0);
                })

                .on("click", function (event: any, d: any) {
                    d3.select(this)
                        .style("fill", "green");

                    thiz.tooltip.text("Opening...")
                        .style("left", (event.pageX + 15) + "px")
                        .style("top", (event.pageY - 50) + "px");

                    if (d.data.id) {
                        window.open(S.util.getHostAndPort() + "?id=" + d.data.id, "_blank");
                    }
                })
                .call(drag(simulation));

            simulation.on("tick", function () {
                link
                    .attr("x1", function (d: any) { return d.source.x; })
                    .attr("y1", function (d: any) { return d.source.y; })
                    .attr("x2", function (d: any) { return d.target.x; })
                    .attr("y2", function (d: any) { return d.target.y; });

                node
                    .attr("cx", function (d: any) { return d.x; })
                    .attr("cy", function (d: any) { return d.y; });
            });

            const zoomHandler = d3.zoom()
                .on("zoom", function (event: any) {
                    const { transform } = event;
                    g.attr("stroke-width", 1 / transform.k);
                    g.attr("transform", transform);
                });

            zoomHandler(svg);
        };
    }

    getColorForLevel(level: number): string {
        switch (level) {
            case 1:
                return "red";
            case 2:
                return "orange";
            case 3:
                return "blueviolet";
            case 4:
                return "brown";
            case 5:
                return "blue";
            case 6:
                return "deeppink";
            case 7:
                return "darkcyan";
            case 8:
                return "orange";
            case 9:
                return "purple";
            case 10:
                return "brown";
            case 11:
                return "slateblue";
            case 12:
                return "slategrey";
            default:
                return "#fff";
        }
    }

    updateTooltip = async (d: any, x: number, y: number) => {
        const res = await S.rpcUtil.rpc<J.RenderNodeRequest, J.RenderNodeResponse>("renderNode", {
            nodeId: d.data.id,
            upLevel: false,
            siblingOffset: 0,
            renderParentIfLeaf: false,
            forceRenderParent: false,
            offset: 0,
            goToLastPage: false,
            forceIPFSRefresh: false,
            singleNode: true,
            parentCount: 0
        });

        if (res?.node) {
            let content = res.node.content;
            if (content.length > 100) {
                content = content.substring(0, 100) + "...";
            }
            d.data.name = content;
            this.showTooltip(d, x, y);
        }
    }

    showTooltip = (d: any, x: number, y: number) => {
        this.tooltip.transition()
            .duration(300)
            .style("opacity", (d: any) => !this.isDragging ? 0.97 : 0);

        // DO NOT DELETE (example for how to use HTML)
        // this.tooltip.html(() => {
        //     return "<div class='alert alert-secondary'>" + d.data.name + "</div>";
        // })
        this.tooltip.text(d.data.name)
            .style("left", (x + 15) + "px")
            .style("top", (y - 50) + "px");
    }

    domRemoveEvent = () => {
        console.log("Graph stopSim");
        this.stopSim();
    }

    domUpdateEvent = () => {
        if (S.view.docElm) {
            // NOTE: Since the docElm component doesn't manage scroll position, we can get away with just
            // setting scrollTop on it directly like this, instead of calling 'elm.setScrollTop()'
            S.view.docElm.scrollTop = 0;
        }
    }

    stopSim = () => {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
    }
}
