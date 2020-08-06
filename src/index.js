import express from 'express'
import handlebars from 'express-handlebars'
import path from 'path'
import vhost from 'vhost'
import multer from 'multer'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'

import router from './router'
import auth from './auth'

export const AUTHDIR = path.resolve(__dirname, '../../auth')

const app = express()
const upload = multer()

app.set('view engine', 'hbs')
app.set('views', path.join(__dirname, '../../views'))

app.engine('hbs', 
  handlebars({
    defaultLayout: 'index',
    extname: 'hbs',
    layoutsDir: path.join(__dirname, '../../views/layouts'),
    partialsDir: path.join(__dirname, '../../views'),
  })
)

app.use(cookieParser())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(upload.array()) 
app.use(express.static('public'))

app.use('/static', express.static(path.resolve(__dirname, '../../static')))

app.use(router)
app.use('/auth', auth)

app.listen(3000, () => console.log('Server started') )