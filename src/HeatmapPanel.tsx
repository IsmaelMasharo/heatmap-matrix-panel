// @ts-nocheck
import React from 'react';
import * as d3 from 'd3';
import { PanelProps } from '@grafana/data';
import { HeatmapOptions } from 'types';

interface Props extends PanelProps<HeatmapOptions> {}

export const HeatmapPanel: React.FC<Props> = ({ options, data, width, height }) => {
  // -----------------------    CHART CONSTANTS    -----------------------
  const CHART_REQUIRED_FIELDS = { pivot: 'pivot' };
  const PERCENTAGE_CHANGE_DIRECTION = { topToBottom: 'topToBottom', bottomToTop: 'bottomToTop' };
  const COLOR_CELL_BY = { change: 0, heatmap: 1 };
  const COLOR_OPTIONS_SIZE = Object.keys(COLOR_CELL_BY).length;

  // -----------------------  CHART CONFIGURATION  -----------------------
  const config = {
    background: 'white',
    removeEmptyCols: true,
    changeDirection: options.changeDirection,
    colorBy: COLOR_CELL_BY.change,
    toggleColor: options.toggleColor,
  };

  // The indices are drawn from top (index 0) to bottom (index dataLen - 1)
  // keeping the original order. There's no option in this plugin to reverse the order.
  // This option is intended to handle the COLOR in which the items will be filled
  // when the reference is per category
  // Note: when a cell is clicked a regular heatmap is drawn toggling this variable effect
  config.referenceChange =
    config.changeDirection === PERCENTAGE_CHANGE_DIRECTION.bottomToTop
      ? 1 // next pivot index
      : -1; // previous pivot index

  // ----------------------- BASE DATA ACQUISITION -----------------------
  const frame = data.series[0];
  const dataLen = frame.length;

  // -----------------------       ACCESSORS      -----------------------
  const pivotAccesor = frame.fields.find(field => field.name === CHART_REQUIRED_FIELDS.pivot);
  const baseCategoryFields = frame.fields.filter(field => field.name !== CHART_REQUIRED_FIELDS.pivot);
  const categoryFields = !config.removeEmptyCols
    ? baseCategoryFields
    : baseCategoryFields.filter(field => d3.sum(field.values.toArray()) > 0);

  // -----------------------      VALIDATIONS     -----------------------
  if (!pivotAccesor) {
    throw new Error(`Required fields not present: ${Object.keys(CHART_REQUIRED_FIELDS).join(', ')}`);
  }

  // -----------------------  CHART FIELD VALUES  -----------------------
  const pivots = pivotAccesor.values.toArray();
  const categories = categoryFields.map(field => field.name);

  const pivotIndices = d3.range(dataLen);
  const categoryExtent = d3.extent(categoryFields.flatMap(field => d3.extent(field.values.toArray())));

  // -----------------------    CHART DIMENSIONS  -----------------------
  const dimensions = {
    width: width,
    height: height,
    marginTop: 20,
    marginRight: 30,
    marginBottom: 10,
    marginLeft: 40,
  };

  dimensions.boundedWidth = dimensions.width - dimensions.marginLeft - dimensions.marginRight;
  dimensions.boundedHeight = dimensions.height - dimensions.marginTop - dimensions.marginBottom;

  // -----------------------    CHART ELEMENTS    -----------------------
  // COLOR BY VERTICAL CHANGE PERCENTAGE
  const colorByChange = d3
    .scaleLinear()
    .domain([-1.5, 0, 1.5])
    .range(['red', 'rgb(250, 248, 193)', 'green'])
    .interpolate(d3.interpolateRgb);

  // COLOR BY COMPLETE VALUES - PROPER HEATMAP
  // clampling interpolater to avoid using lighter and stronger blues
  const clampColorRange = d3.interpolate(0, 0.7);
  const colorAsHeatmap = d3
    .scaleSequential()
    .domain(categoryExtent)
    .interpolator(t => d3.interpolateBlues(clampColorRange(t)));

  // SCALES
  const x = d3
    .scaleBand()
    .domain(categories)
    .range([0, dimensions.boundedWidth])
    .padding(0.2);

  const y = d3
    .scaleBand()
    .domain(pivots)
    .range([0, dimensions.boundedHeight])
    .padding(0.2);

  // AXIS
  const xAxis = g =>
    g
      .call(
        d3
          .axisTop(x)
          .tickSize(0)
          .tickSizeOuter(0)
      )
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('dy', '.5em')
      .style('text-anchor', 'midle');

  const yAxis = g =>
    g
      .call(
        d3
          .axisLeft(y)
          .tickSize(0)
          .tickPadding(4)
      )
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('x', 5);

  // VALUE FORMATING
  const formatValue = ({ category, pivotIndex }) =>
    parseFloat(d3.format('.2f')(categoryFields.find(field => field.name === category).values.get(pivotIndex)));

  const getValues = ({ category, pivotIndex }) => {
    const referenceIndex = pivotIndex + config.referenceChange;
    const currentValue = formatValue({ category, pivotIndex });
    const referenceValue = formatValue({ category, pivotIndex: referenceIndex }) || 0;
    const change = (currentValue - referenceValue) / referenceValue;
    return { currentValue, referenceValue, change };
  };

  // CHART
  const chart = svg => {
    // SVG STYLING
    svg.style('background-color', config.background);

    // BOUNDS
    const bounds = svg.append('g').attr('transform', `translate(${dimensions.marginLeft}, ${dimensions.marginTop})`);

    // MATRIX
    bounds
      .selectAll('g')
      .data(pivotIndices)
      .join('g')
      .each((pivotIndex, i, nodes) => {
        // CONSTANTS PER GROUP
        const itemPositionY = y(pivotAccesor.values.get(pivotIndex));

        // HELPERS
        const colorChange = d => {
          const { currentValue, referenceValue, change } = getValues(d);
          // clamping change to avoid using the stronger tone generated by interpolator
          const clampedChange = change > 1 ? 1 : change < -1 ? -1 : change;

          return currentValue === 0
            ? colorByChange(0)
            : referenceValue === 0
            ? colorByChange(0.5)
            : colorByChange(clampedChange);
        };

        const colorHeatmap = d => {
          const { currentValue } = getValues(d);
          return colorAsHeatmap(currentValue);
        };

        const getColor = d => {
          switch (config.colorBy) {
            case COLOR_CELL_BY.change:
              return colorChange(d);
            case COLOR_CELL_BY.heatmap:
              return colorHeatmap(d);
            default:
              break;
          }
        };

        const toggleColoring = _ => {
          if (!config.toggleColor) {
            return;
          }
          config.colorBy = (config.colorBy + 1) % COLOR_OPTIONS_SIZE;
          bounds
            .selectAll('.matrix-cell')
            .transition()
            .duration(500)
            .attr('fill', getColor);
        };

        // DRAWING
        const item = d3
          .select(nodes[i])
          .selectAll('g')
          .data(categories.map(category => ({ category, pivotIndex })))
          .join('g');

        // CELLS
        item
          .append('rect')
          .attr('class', 'matrix-cell')
          .attr('x', d => x(d.category))
          .attr('y', itemPositionY)
          .attr('rx', 2)
          .attr('ry', 2)
          .attr('width', x.bandwidth())
          .attr('height', y.bandwidth())
          .on('click', toggleColoring)
          .attr('fill', getColor)
          .append('title')
          .text(formatValue);

        // VALUES
        item
          .append('text')
          .attr('font-size', 10)
          .attr('pointer-events', 'none')
          .attr('text-anchor', 'middle')
          // .attr('x', category => x(category) + x.bandwidth() / 2)
          // .attr('y', itemPositionY + y.bandwidth() / 2)
          .call(text =>
            text
              .append('tspan')
              .attr('x', d => x(d.category) + x.bandwidth() / 2)
              .attr('y', itemPositionY + y.bandwidth() / 2)
              .each((d, i, nodes) => {
                const { currentValue, referenceValue } = getValues(d);

                d3.select(nodes[i])
                  // move up a little => room for percentage change
                  .attr('dy', currentValue && referenceValue ? '-0.4em' : '.35em')
                  // display totals if total > 0
                  .text(currentValue ? d3.format('.3~s')(currentValue) : '-');
              })
          )
          .call(text =>
            text
              .append('tspan')
              .attr('x', d => x(d.category) + x.bandwidth() / 2)
              .attr('y', itemPositionY + y.bandwidth() / 2)
              .each((d, i, nodes) => {
                const { currentValue, referenceValue, change } = getValues(d);

                if (currentValue && referenceValue) {
                  // display percentage change bellow totals
                  d3.select(nodes[i])
                    .attr('dy', '1em')
                    .text(d3.format('.1%')(change));
                }
              })
          );
      });

    // AXIS
    bounds.append('g').call(xAxis);
    bounds.append('g').call(yAxis);
  };

  return (
    <svg
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      ref={node => {
        d3.select(node)
          .selectAll('*')
          .remove();
        d3.select(node).call(chart);
      }}
    />
  );
};
