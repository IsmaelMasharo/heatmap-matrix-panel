// @ts-nocheck
import React from 'react';
import * as d3 from 'd3';
import { PanelProps } from '@grafana/data';
import { HeatmapOptions } from 'types';

interface Props extends PanelProps<HeatmapOptions> {}
// TODO: FIX WHEN REPEATED NAMES PRESENT PER COLUMNS OR ROWS
export const HeatmapPanel: React.FC<Props> = ({ options, data, width, height }) => {
  // -----------------------    CHART CONSTANTS    -----------------------
  const CHART_REQUIRED_FIELDS = { pivot: 'idx' };
  const PERCENTAGE_CHANGE_DIRECTION = { topToBottom: 'topToBottom', bottomToTop: 'bottomToTop' };
  const COLOR_CELL_BY = { rowChangePerColumn: 0, heatmap: 1 };
  const COLOR_OPTIONS_SIZE = Object.keys(COLOR_CELL_BY).length;

  // -----------------------  CHART CONFIGURATION  -----------------------
  const config = {
    cellPadding: 0.16,
    background: '#f8f8fa',
    removeEmptyCols: true,
    colorBy: COLOR_CELL_BY[options.colorCellBy],
    toggleColor: options.toggleColor,
    changeDirection: options.changeDirection,
    changeDirectionSymbol: { topToBottom: '↓', bottomToTop: '↑', heatmap: '' },
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
    throw new Error(`Required fields not present: ${Object.values(CHART_REQUIRED_FIELDS).join(', ')}`);
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
    .padding(config.cellPadding);

  const y = d3
    .scaleBand()
    .domain(pivots)
    .range([0, dimensions.boundedHeight])
    .padding(config.cellPadding);

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
      .attr('dy', '.2em')
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
      .style('text-anchor', 'end')
      .attr('x', 2);

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

  // CHANGE DIRECTION SYMBOL
  const getSymbol = () => {
    if (config.colorBy !== COLOR_CELL_BY.heatmap) {
      return config.changeDirectionSymbol[config.changeDirection];
    }
    return config.changeDirectionSymbol.heatmap;
  };

  // CHART
  const chart = svg => {
    // SVG STYLING
    svg.style('background-color', config.background);

    // BOUNDS
    const bounds = svg.append('g').attr('transform', `translate(${dimensions.marginLeft}, ${dimensions.marginTop})`);

    // CHANGE DIRECTION SYMBOL
    bounds
      .append('rect')
      .attr('x', -15)
      .attr('y', -15)
      .attr('width', 20)
      .attr('height', 20)
      .attr('fill', config.background)
      .append('title')
      .text('Change direction');

    bounds
      .append('text')
      .attr('class', 'change-direction-symbol')
      .attr('text-anchor', 'end')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text(getSymbol);

    // MATRIX
    bounds
      .selectAll('.pivot-index-row')
      .data(pivotIndices)
      .join('g')
      .attr('class', 'pivot-index-row')
      .each((pivotIndex, i, nodes) => {
        // CONSTANTS PER GROUP
        const itemPositionY = y(pivotAccesor.values.get(pivotIndex));

        // DISPLAY VALUES HELPERS
        const percentVisible = () => config.colorBy !== COLOR_CELL_BY.heatmap;
        const decenteredTotals = (curr, ref) => curr && ref && percentVisible();

        const displayTotals = text =>
          text
            .append('tspan')
            .attr('x', d => x(d.category) + x.bandwidth() / 2)
            .attr('y', itemPositionY + y.bandwidth() / 2)
            .attr('class', 'cell-label-total')
            .each((d, i, nodes) => {
              const { currentValue, referenceValue } = getValues(d);
              const notCenteredTotals = decenteredTotals(currentValue, referenceValue);

              d3.select(nodes[i])
                // move up a little => room for percentage change
                .attr('dy', notCenteredTotals ? '-0.4em' : '.35em')
                // display totals if total > 0
                .text(currentValue ? d3.format('.3~s')(currentValue) : '-');
            });

        const displayPercentages = text =>
          text
            .append('tspan')
            .attr('x', d => x(d.category) + x.bandwidth() / 2)
            .attr('y', itemPositionY + y.bandwidth() / 2)
            .attr('class', 'cell-label-percentage')
            .each((d, i, nodes) => {
              const { currentValue, change } = getValues(d);

              if (currentValue && isFinite(change)) {
                // display percentage change bellow totals
                d3.select(nodes[i])
                  .attr('dy', '1em')
                  .text(d3.format('.1%')(change))
                  .attr('visibility', percentVisible() ? 'visible' : 'hidden');
              }
            });

        // COLORING HELPERS
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
            case COLOR_CELL_BY.rowChangePerColumn:
              return colorChange(d);
            case COLOR_CELL_BY.heatmap:
              return colorHeatmap(d);
            default:
              break;
          }
        };

        // ON CLICK ACTION
        const toggleColoring = _ => {
          if (!config.toggleColor) {
            return;
          }
          config.colorBy = (config.colorBy + 1) % COLOR_OPTIONS_SIZE;

          // this will only work for the current row
          // item.selectAll('.cell-shape')

          bounds
            .selectAll('.matrix-cell>.cell-shape')
            .transition()
            .duration(500)
            .attr('fill', getColor);

          bounds.selectAll('.matrix-cell>.cell-label>.cell-label-total').each(function() {
            const percenValue = this.nextSibling.textContent;
            d3.select(this).attr('dy', percentVisible() && percenValue ? '-0.4em' : '.35em');
          });

          bounds
            .selectAll('.matrix-cell>.cell-label>.cell-label-percentage')
            .attr('visibility', percentVisible() ? 'visible' : 'hidden');

          bounds.selectAll('.change-direction-symbol').text(getSymbol);
        };

        // DRAWING
        const item = d3
          .select(nodes[i])
          .selectAll('.matrix-cell')
          .data(categories.map(category => ({ category, pivotIndex })))
          .join('g')
          .attr('class', 'matrix-cell')
          .on('click', toggleColoring);

        // CELLS
        item
          .append('rect')
          .attr('class', 'cell-shape')
          .attr('x', d => x(d.category))
          .attr('y', itemPositionY)
          .attr('rx', 2)
          .attr('ry', 2)
          .attr('width', x.bandwidth())
          .attr('height', y.bandwidth())
          .attr('fill', getColor)
          .append('title')
          .text(formatValue);

        // VALUES
        item
          .append('text')
          .attr('class', 'cell-label')
          .attr('font-size', 10)
          .attr('pointer-events', 'none')
          .attr('text-anchor', 'middle')
          .call(displayTotals)
          .call(displayPercentages);
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
