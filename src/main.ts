import App from './App.js'

window.onload = () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    const app = new App(canvas, 800, 800)
}