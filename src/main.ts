import App from './App.js'

window.onload = () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    new App(canvas)
}
