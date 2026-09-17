export interface ColorDef {
  id: string;
  name: string;
  hex: string;
  gradient: [string, string];
  bubbleColor: string;
}

export const WATER_COLORS: ColorDef[] = [
  { id: 'red', name: 'Ruby Red', hex: '#ef4444', gradient: ['#f87171', '#dc2626'], bubbleColor: '#fca5a5' },
  { id: 'yellow', name: 'Sunny Yellow', hex: '#facc15', gradient: ['#fde047', '#eab308'], bubbleColor: '#fef08a' },
  { id: 'pink', name: 'Berry Pink', hex: '#ec4899', gradient: ['#f472b6', '#db2777'], bubbleColor: '#fbcfe8' },
  { id: 'lime', name: 'Lime Green', hex: '#84cc16', gradient: ['#a3e635', '#65a30d'], bubbleColor: '#d9f99d' },
  { id: 'sky', name: 'Sky Blue', hex: '#0ea5e9', gradient: ['#38bdf8', '#0284c7'], bubbleColor: '#bae6fd' },
  { id: 'blue', name: 'Ocean Blue', hex: '#2563eb', gradient: ['#60a5fa', '#1d4ed8'], bubbleColor: '#bfdbfe' },
  { id: 'mint', name: 'Mint Teal', hex: '#10b981', gradient: ['#34d399', '#059669'], bubbleColor: '#a7f3d0' },
  { id: 'orange', name: 'Juicy Orange', hex: '#f97316', gradient: ['#fb923c', '#ea580c'], bubbleColor: '#fed7aa' },
  { id: 'choco', name: 'Cocoa Brown', hex: '#78350f', gradient: ['#92400e', '#592507'], bubbleColor: '#d97706' },
  { id: 'purple', name: 'Grape Purple', hex: '#8b5cf6', gradient: ['#a78bfa', '#7c3aed'], bubbleColor: '#ddd6fe' }
];

export const TUBE_CAPACITY = 4;
export const UNITS_PER_COLOR = 3;
export const TOTAL_TUBES = 10;
export const TOTAL_COLORS = 10;

export interface ReservoirState {
  color: string | null;
  count: number;
  maxCapacity: number;
}

export interface MoveRecord {
  type: 'tube_to_tube' | 'tube_to_reservoir';
  srcIndex: number;
  dstIndex?: number;
  color: string;
  count: number;
  prevReservoirColor: string | null;
  prevReservoirCount: number;
  completedColor?: string | null;
}

export interface WaterGameState {
  tubes: string[][]; // 10 tubes, each an array of color IDs (bottom-to-top)
  reservoir: ReservoirState;
  completedColors: string[];
  score: number;
  moveCount: number;
  isWon: boolean;
}
