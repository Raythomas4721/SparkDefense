import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BattleScene } from './scenes/BattleScene';
import { StarterScene } from './scenes/StarterScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0d14',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // 第一個場景會判斷要不要顯示御三家選擇，選過就直接進戰鬥
  scene: [StarterScene, BattleScene],
});
