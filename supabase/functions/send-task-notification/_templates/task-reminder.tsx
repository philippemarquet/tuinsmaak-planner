import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22';
import * as React from 'npm:react@18.3.1';

interface TaskReminderEmailProps {
  userName: string;
  taskType: string;
  seedName: string;
  bedName: string;
  dueDate: string;
  appUrl: string;
}

export const TaskReminderEmail = ({
  userName,
  taskType,
  seedName,
  bedName,
  dueDate,
  appUrl,
}: TaskReminderEmailProps) => (
  <Html>
    <Head />
    <Preview>Tuintaak herinnering: {taskType} voor {seedName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🌱 Tuintaak Herinnering</Heading>
        <Text style={text}>Hallo {userName},</Text>
        <Text style={text}>
          Je hebt een tuintaak die aandacht nodig heeft:
        </Text>
        <Section style={taskBox}>
          <Text style={taskTitle}>{taskType}</Text>
          <Text style={taskDetail}>
            <strong>Gewas:</strong> {seedName}
          </Text>
          <Text style={taskDetail}>
            <strong>Bak:</strong> {bedName}
          </Text>
          <Text style={taskDetail}>
            <strong>Gepland:</strong> {dueDate}
          </Text>
        </Section>
        <Link
          href={appUrl}
          target="_blank"
          style={button}
        >
          Open Dashboard
        </Link>
        <Text style={footer}>
          Deze herinnering is verstuurd omdat je notificaties hebt ingeschakeld in je instellingen.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default TaskReminderEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 48px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 48px',
};

const taskBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  margin: '24px 48px',
  padding: '24px',
};

const taskTitle = {
  color: '#16a34a',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 16px 0',
};

const taskDetail = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '8px 0',
};

const button = {
  backgroundColor: '#16a34a',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '200px',
  padding: '12px 0',
  margin: '24px 48px',
};

const footer = {
  color: '#898989',
  fontSize: '12px',
  lineHeight: '22px',
  margin: '32px 48px 0',
};
