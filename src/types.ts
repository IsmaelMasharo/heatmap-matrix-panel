type ColorCellBy = 'heatmap' | 'rowChangePerColumn';
type ChangeDirection = 'bottomToTop' | 'topToBottom';

export interface HeatmapOptions {
  colorCellBy: ColorCellBy;
  changeDirection: ChangeDirection;
  toggleColor: boolean;
}
