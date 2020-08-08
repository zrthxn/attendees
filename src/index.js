import express from 'express'
import handlebars from 'express-handlebars'
import path from 'path'
import vhost from 'vhost'
import multer from 'multer'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'

export const AUTHDIR = path.resolve(__dirname, '../../auth')

const app = express()
const multipart = multer()

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

app.use(cookieParser(process.env.AUTH_KEY))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(multipart.array()) 
app.use('/static', express.static(path.resolve(__dirname, '../../static')))

import { authRouter } from './auth'
import { sheetRouter, markingRouter } from './router'

app.get('/', (_, res) => res.render('home', { title: 'Sheets Attendance | Attendance Management for Virtual Classes' }))
app.get('/github', (_, res) => res.redirect('https://github.com/zrthxn/attendees'))

app.use('/auth', authRouter)
app.use('/sheets', sheetRouter)
app.use('/mark', markingRouter)

app.listen(3000, () => console.log('Listening') )