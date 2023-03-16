import { createContext, runApp, ApplicationContext } from '@skyslit/ark-core';
import path from 'path';
import { Backend } from '@skyslit/ark-backend';
import TestModule from '../modules/Module1/mock.module';
import Express from 'express';
// Client application
import AdminClientApp from '../admin.client';

const app = createContext(({ use, useModule }) => {
  const { useServer, useRoute, useWebApp, useApp } = use(Backend);
  const AdminWebApp = useWebApp(
    'admin',
    AdminClientApp,
    path.join(__dirname, '../admin.html')
  );

  const express = useApp();
  express.use('/_browser', Express.static(path.join(__dirname, '../_browser')));

  useModule('test_id', TestModule);

  useRoute('get', '/test', (req, res) => {
    res.send('Test');
  });

  useRoute('get', '/', AdminWebApp.render());

  useServer({
    port: 3001,
  } as any);
});

runApp(app);

process.on('SIGTERM', () => {
  ApplicationContext.getInstance()
    .deactivate()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
});
