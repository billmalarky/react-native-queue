# React Native Queue

[![Build Status](https://travis-ci.org/billmalarky/react-native-queue.svg?branch=master)](https://travis-ci.org/billmalarky/react-native-queue)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/billmalarky/react-native-queue/blob/master/LICENSE)
[![ESLint](https://img.shields.io/badge/eslint-ok-green.svg)](https://github.com/billmalarky/react-native-queue/blob/master/.eslintrc.js)
[![Coverage Status](https://coveralls.io/repos/github/billmalarky/react-native-queue/badge.svg?branch=master)](https://coveralls.io/github/billmalarky/react-native-queue?branch=master)

A React Native job queue / task queue backed by persistent Realm storage. Jobs will persist until completed, even if user closes and re-opens app. React Native Queue is easily integrated into React Native background processes so you can ensure the queue will continue to process until all jobs are completed.

