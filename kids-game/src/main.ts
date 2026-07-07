import StartGame from './game/main';

document.addEventListener('DOMContentLoaded', () => {

    const game = StartGame('game-container');

    //  Handy for debugging in the browser console
    (window as any).game = game;

});