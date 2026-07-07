import { Boot } from './scenes/Boot';
import { Dashboard } from './scenes/Dashboard';
import { Driving } from './scenes/Driving';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 720,
    height: 1280,
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
        Dashboard
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
