import { Boot } from './scenes/Boot';
import { Builder } from './scenes/Builder';
import { Cooking } from './scenes/Cooking';
import { Dashboard } from './scenes/Dashboard';
import { Driving } from './scenes/Driving';
import { AUTO, Game, Scale } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './layout';
import { Interior } from './scenes/Interior';
import { Options } from './scenes/Options';
import { Preloader } from './scenes/Preloader';
import { Shop } from './scenes/Shop';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#263238',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade'
    },
    scene: [
        Boot,
        Preloader,
        Driving,
        Dashboard,
        Options,
        Builder,
        Interior,
        Cooking,
        Shop
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
