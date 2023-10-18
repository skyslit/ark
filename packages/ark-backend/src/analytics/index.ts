import { ApplicationContext, ControllerContext } from '@skyslit/ark-core';
import { defineService, useServiceCreator } from '..';
import { Connection } from 'mongoose';
import { ObjectId } from 'mongodb';
import Joi from 'joi';
import moment from 'moment';

export function enableAnalytics(
  context: ApplicationContext,
  controller: ControllerContext<any>,
  moduleId: string
) {
  const useService = useServiceCreator(moduleId, context);

  /**
   * Import db connection
   */
  const mongooseConnection: Connection = context.getData(
    'default',
    `db/default`,
    null
  );

  if (!mongooseConnection) {
    throw new Error(
      "Looks like you're trying to enableAnalytics before the database is available, or have you actually configured the database connection?"
    );
  }

  const collectionNames = {
    usersCollectionName: 'analytics_users',
    sessionsCollectionName: 'analytics_sessions',
    eventsCollectionName: 'analytics_events',
  };

  const usersCollection = mongooseConnection.db.collection(
    collectionNames.usersCollectionName
  );
  const sessionsCollection = mongooseConnection.db.collection(
    collectionNames.sessionsCollectionName
  );
  const eventsCollection = mongooseConnection.db.collection(
    collectionNames.eventsCollectionName
  );

  const initialiseSession = async (
    nowInUtc: moment.Moment,
    props: any,
    analyticsUserId: string,
    analyticsSessionId: string,
    tid: string
  ) => {
    const timestampInUtc = nowInUtc.valueOf();
    let user: any, session: any;

    if (!tid) {
      tid = props.args.req.cookies['sa_tid'];
    }

    if (Boolean(tid) && tid !== props.args.req.cookies['sa_tid']) {
      props.args.res.cookie('sa_tid', tid, {
        expires: moment().utc().add(3, 'years').toDate(),
      });
    }

    if (analyticsUserId) {
      user = await usersCollection.findOne({
        _id: new ObjectId(analyticsUserId),
      });
    }

    if (!user) {
      console.log('Initialising new user');
      const op = await usersCollection.insertOne({
        userObj: null,
        createdAtUtc: timestampInUtc,
        lastSeenInUtc: timestampInUtc,
        tid,
      });

      analyticsUserId = String(op.insertedId);
      props.args.res.cookie('sa_uid', analyticsUserId, {
        expires: moment().utc().add(1, 'year').toDate(),
      });

      user = await usersCollection.findOne({
        _id: new ObjectId(analyticsUserId),
      });
    }

    if (analyticsSessionId) {
      session = await sessionsCollection.findOne({
        _id: new ObjectId(analyticsSessionId),
      });
    }

    if (!session) {
      console.log('Initialising new session');
      const op = await sessionsCollection.insertOne({
        analyticsUserId,
        userObj: session?.userObj,
        createdAtUtc: timestampInUtc,
        lastSeenInUtc: timestampInUtc,
        tid,
      });

      analyticsSessionId = String(op.insertedId);

      session = await sessionsCollection.findOne({
        _id: new ObjectId(analyticsSessionId),
      });
    }

    props.args.res.cookie('sa_sid', analyticsSessionId, {
      expires: moment().utc().add(15, 'minutes').toDate(),
    });

    return {
      user,
      session,
      analyticsUserId,
      analyticsSessionId,
      tid,
    };
  };

  useService(
    defineService('analytics_track_api', (props) => {
      props.defineValidator(
        Joi.object({
          events: Joi.array().min(0),
          tid: Joi.string().optional().allow(''),
        })
      );

      props.defineLogic(async (props) => {
        const { events } = props.args.input;
        const nowInUtc = moment.utc();
        const nowInUtcTimestamp = nowInUtc.valueOf();

        let instance = await initialiseSession(
          nowInUtc,
          props,
          props.args.req.cookies['sa_uid'],
          props.args.req.cookies['sa_sid'],
          props.args.input.tid
        );

        if (!instance.analyticsUserId) {
          console.log('Initialising new user');
          const op = await usersCollection.insertOne({});

          instance.analyticsUserId = String(op.insertedId);
          props.args.res.cookie('sa_uid', instance.analyticsUserId, {
            expires: moment().utc().add(1, 'year').toDate(),
          });
        } else {
          instance.user = await usersCollection.findOne({
            _id: new ObjectId(instance.analyticsUserId),
          });
        }

        if (!instance.analyticsSessionId) {
          console.log('Initialising new session');
          const op = await sessionsCollection.insertOne({});

          instance.analyticsSessionId = String(op.insertedId);
          props.args.res.cookie('sa_sid', instance.analyticsSessionId, {
            expires: moment().utc().add(15, 'minutes').toDate(),
          });
        } else {
          instance.session = await sessionsCollection.findOne({
            _id: new ObjectId(instance.analyticsSessionId),
          });
        }

        let eventsToPush: any[] = [];
        let hasUpdatedLastSeen = false;

        if (instance.user && instance.session && Array.isArray(events)) {
          for (const event of events) {
            switch (event?.type) {
              case 'setUser': {
                const { id, payload } = event?.payload || {};

                const userObj = {
                  userId: id,
                  ...payload,
                };

                await usersCollection.updateOne(
                  {
                    _id: new ObjectId(instance.analyticsUserId),
                  },
                  {
                    $set: {
                      userObj,
                      lastSeenInUtc: nowInUtcTimestamp,
                    },
                  },
                  { upsert: true }
                );

                await sessionsCollection.updateOne(
                  {
                    _id: new ObjectId(instance.analyticsSessionId),
                    analyticsUserId: instance.analyticsUserId,
                  },
                  {
                    $set: {
                      userObj,
                      userInfoUpdatedOnUtc: nowInUtcTimestamp,
                      lastSeenInUtc: nowInUtcTimestamp,
                    },
                  }
                );

                hasUpdatedLastSeen = true;

                break;
              }
              case 'unsetUser': {
                await usersCollection.updateOne(
                  {
                    _id: new ObjectId(instance.analyticsUserId),
                  },
                  {
                    $set: {
                      userObj: null,
                      lastSeenInUtc: nowInUtcTimestamp,
                    },
                  },
                  { upsert: true }
                );

                await sessionsCollection.updateOne(
                  {
                    _id: new ObjectId(instance.analyticsSessionId),
                    analyticsUserId: instance.analyticsUserId,
                  },
                  {
                    $set: {
                      userUnsetInUtc: nowInUtcTimestamp,
                      lastSeenInUtc: nowInUtcTimestamp,
                    },
                  }
                );

                hasUpdatedLastSeen = true;

                instance = await initialiseSession(
                  nowInUtc,
                  props,
                  instance.analyticsUserId,
                  null,
                  instance.tid
                );
              }
              case 'trackEvent': {
                const { type, payload, clientTimestampInUtc } =
                  event?.payload || {};
                if (!type) {
                  break;
                }

                let timestampInUtc: number = nowInUtcTimestamp;

                if (clientTimestampInUtc) {
                  const m = moment.utc(clientTimestampInUtc);
                  if (m.isValid() === true) {
                    timestampInUtc = m.valueOf();
                  }
                }

                eventsToPush.push({
                  tid: instance.tid,
                  sessionId: instance.analyticsSessionId,
                  userId: instance.analyticsUserId,
                  serverTimestampInUtc: nowInUtcTimestamp,
                  timestampInUtc,
                  type,
                  payload,
                });

                break;
              }
            }
          }
        }

        if (hasUpdatedLastSeen === false) {
          await usersCollection.updateOne(
            {
              _id: new ObjectId(instance.analyticsUserId),
            },
            {
              $set: {
                lastSeenInUtc: nowInUtcTimestamp,
              },
            },
            { upsert: true }
          );

          await sessionsCollection.updateOne(
            {
              _id: new ObjectId(instance.analyticsSessionId),
              analyticsUserId: instance.analyticsUserId,
            },
            {
              $set: {
                lastSeenInUtc: nowInUtcTimestamp,
              },
            }
          );
        }

        if (eventsToPush.length > 0) {
          await eventsCollection.insertMany(eventsToPush);
        }

        /** Initialise */

        return props.success({ ack: true });
      });
    }),
    {
      method: 'post',
      path: '/api/v1/analytics',
    }
  );
}
