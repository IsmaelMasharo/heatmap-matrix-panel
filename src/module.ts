import { PanelPlugin } from '@grafana/data';
import { HeatmapOptions } from './types';
import { HeatmapPanel } from './HeatmapPanel';

export const plugin = new PanelPlugin<HeatmapOptions>(HeatmapPanel).setPanelOptions(builder => {
  return builder
    .addSelect({
      path: 'colorCellBy',
      name: 'Cell Color',
      defaultValue: 'heatmap',
      settings: {
        options: [
          {
            value: 'heatmap',
            label: 'Heatmap',
          },
          {
            value: 'rowChangePerColumn',
            label: 'By change in row level Per column',
          },
        ],
      },
    })
    .addSelect({
      path: 'changeDirection',
      name: 'Change Direction (when color by change)',
      defaultValue: 'bottomToTop',
      settings: {
        options: [
          {
            value: 'bottomToTop',
            label: 'Bottom to Top',
          },
          {
            value: 'topToBottom',
            label: 'Top to Bottom',
          },
        ],
      },
    })
    .addBooleanSwitch({
      path: 'toggleColor',
      name: 'Toggle Color on click',
      defaultValue: false,
    });
});
