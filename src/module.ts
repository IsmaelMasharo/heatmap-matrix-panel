import { PanelPlugin } from '@grafana/data';
import { HeatmapOptions } from './types';
import { HeatmapPanel } from './HeatmapPanel';

export const plugin = new PanelPlugin<HeatmapOptions>(HeatmapPanel).setPanelOptions(builder => {
  return builder
    .addSelect({
      path: 'changeDirection',
      name: 'Change Direction',
      defaultValue: 'bottomToTop',
      settings: {
        options: [
          {
            value: 'topToBottom',
            label: 'Top to Bottom',
          },
          {
            value: 'bottomToTop',
            label: 'Bottom to Top',
          },
        ],
      },
    })
    .addBooleanSwitch({
      path: 'toggleColor',
      name: 'Toggle Color on click',
      defaultValue: true,
    });
});
