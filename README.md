# Sombrero FX

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U7U8OVC0L)

## What is this?

Sombrero is a [vkBasalt](https://github.com/DadSchoorse/vkBasalt) shader for rendering a virtual display with IMU head-tracking support. *Sombrero provides shade for your head. GET IT??!*

## How does it work?

The shader reads IMU data from shared memory that can be written to by any IMU driver. In other words, this isn't tied to any specific device; anyone can write or modify a device driver to integrate with this shader with very little effort.