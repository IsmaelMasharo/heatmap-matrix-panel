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

  // -----------------------  CHART CONFIGURATION  -----------------------
  const config = {
    background: 'white', // '#fffffc',
    removeEmptyCols: true,
    changeDirection: options.changeDirection,
  };

  // The indices are drawn from top (index 0) to bottom (index dataLen - 1)
  // keeping the original order. There's no option in this plugin to reverse the order.
  // This option is intended to handle the COLOR in which the items will be filled
  // when the reference is per category
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

  // -----------------------    CHART DIMENSIONS  -----------------------
  const dimensions = {
    width: width,
    height: height,
    marginTop: 30,
    marginRight: 40,
    marginBottom: 20,
    marginLeft: 50,
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
  const formatValue = (category, pivotIndex) =>
    parseFloat(d3.format('.2f')(categoryFields.find(field => field.name === category).values.get(pivotIndex)));

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
        const referenceIndex = pivotIndex + config.referenceChange;

        // HELPERS
        const getValues = category => {
          const currentValue = formatValue(category, pivotIndex);
          const referenceValue = formatValue(category, referenceIndex) || 0;
          const change = (currentValue - referenceValue) / referenceValue;
          return { currentValue, referenceValue, change };
        };

        // DRAWING
        const item = d3
          .select(nodes[i])
          .selectAll('g')
          .data(categories)
          .join('g');

        item
          .append('rect')
          .attr('x', category => x(category))
          .attr('y', itemPositionY)
          .attr('width', x.bandwidth())
          .attr('height', y.bandwidth())
          .attr('fill', category => {
            const { currentValue, referenceValue, change } = getValues(category);
            // clamping change to avoid using the stronger tone generated by interpolator
            const clampedChange = change > 1 ? 1 : change < -1 ? -1 : change;

            return currentValue === 0
              ? colorByChange(0)
              : referenceValue === 0
              ? colorByChange(0.5)
              : colorByChange(clampedChange);
          })
          .append('title')
          .text(category => formatValue(category, pivotIndex));

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
              .attr('x', category => x(category) + x.bandwidth() / 2)
              .attr('y', itemPositionY + y.bandwidth() / 2)
              .each((category, i, nodes) => {
                const { currentValue, referenceValue } = getValues(category);

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
              .attr('x', category => x(category) + x.bandwidth() / 2)
              .attr('y', itemPositionY + y.bandwidth() / 2)
              .each((category, i, nodes) => {
                const { currentValue, referenceValue, change } = getValues(category);

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
