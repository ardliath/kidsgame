import { Scene } from 'phaser';

export class Driving extends Scene
{
    constructor ()
    {
        super('Driving');
    }

    create ()
    {
        this.cameras.main.setBackgroundColor(0x028af8);

        this.add.text(512, 384, 'Driving', {
            fontFamily: 'Arial Black', fontSize: 64, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);
    }
}
