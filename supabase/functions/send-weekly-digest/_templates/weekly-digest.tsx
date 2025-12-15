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

interface WeeklyTask {
  type: string;
  typeLabel: string;
  seedName: string;
  bedName: string;
  dueDate: string;
  isOverdue: boolean;
}

interface GardenTaskItem {
  title: string;
  dueDate: string;
  isRecurring: boolean;
  isOverdue: boolean;
}

interface WeeklyDigestEmailProps {
  userName: string;
  overdueTasks: WeeklyTask[];
  upcomingTasks: WeeklyTask[];
  overdueGardenTasks: GardenTaskItem[];
  upcomingGardenTasks: GardenTaskItem[];
  appUrl: string;
  template?: {
    header?: string;
    greeting?: string;
    intro?: string;
    overdueHeader?: string;
    overdueSubtext?: string;
    upcomingHeader?: string;
    upcomingSubtext?: string;
    gardenTasksHeader?: string;
    noTasksMessage?: string;
  };
}

export const WeeklyDigestEmail = ({
  userName,
  overdueTasks,
  upcomingTasks,
  overdueGardenTasks = [],
  upcomingGardenTasks = [],
  appUrl,
  template = {},
}: WeeklyDigestEmailProps) => {
  const header = template.header || '🌱 Wekelijkse Tuinagenda';
  const greeting = (template.greeting || 'Hallo {naam},').replace('{naam}', userName);
  const intro = template.intro || 'Hier is je overzicht voor de komende week:';
  const overdueHeader = template.overdueHeader || '⚠️ Achterstallige acties';
  const overdueSubtext = template.overdueSubtext || 'Deze acties hadden al gedaan moeten zijn:';
  const upcomingHeader = template.upcomingHeader || '📅 Aankomende acties';
  const upcomingSubtext = template.upcomingSubtext || 'Deze acties staan gepland voor de komende 7 dagen:';
  const gardenTasksHeader = template.gardenTasksHeader || '🌿 Tuintaken';
  const noTasksMessage = template.noTasksMessage || '✨ Je hebt geen openstaande taken! Geniet van je tuin.';

  const hasAnyTasks = overdueTasks.length > 0 || upcomingTasks.length > 0 || 
                      overdueGardenTasks.length > 0 || upcomingGardenTasks.length > 0;

  return (
  <Html>
    <Head />
    <Preview>Je wekelijkse tuinagenda: {overdueTasks.length + overdueGardenTasks.length} achterstallig, {upcomingTasks.length + upcomingGardenTasks.length} aankomend</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{header}</Heading>
        <Text style={text}>{greeting}</Text>
        <Text style={text}>{intro}</Text>

        {overdueTasks.length > 0 && (
          <>
            <Heading style={h2}>{overdueHeader} ({overdueTasks.length})</Heading>
            <Text style={subText}>{overdueSubtext}</Text>
            <Section style={taskBox}>
              {overdueTasks.map((task, idx) => (
                <div key={idx} style={taskItem}>
                  <Text style={taskTitle}>{task.typeLabel}</Text>
                  <Text style={taskDetail}>
                    {task.seedName} • {task.bedName}
                  </Text>
                  <Text style={{ ...taskDetail, color: '#dc2626', fontWeight: '600' }}>
                    {task.dueDate}
                  </Text>
                </div>
              ))}
            </Section>
          </>
        )}

        {upcomingTasks.length > 0 && (
          <>
            <Heading style={h2}>{upcomingHeader} ({upcomingTasks.length})</Heading>
            <Text style={subText}>{upcomingSubtext}</Text>
            <Section style={taskBox}>
              {upcomingTasks.map((task, idx) => (
                <div key={idx} style={taskItem}>
                  <Text style={taskTitle}>{task.typeLabel}</Text>
                  <Text style={taskDetail}>
                    {task.seedName} • {task.bedName}
                  </Text>
                  <Text style={taskDetail}>
                    {task.dueDate}
                  </Text>
                </div>
              ))}
            </Section>
          </>
        )}

        {/* Tuintaken sectie */}
        {(overdueGardenTasks.length > 0 || upcomingGardenTasks.length > 0) && (
          <>
            <Heading style={h2}>{gardenTasksHeader}</Heading>
            
            {overdueGardenTasks.length > 0 && (
              <>
                <Text style={{ ...subText, color: '#dc2626' }}>Achterstallig:</Text>
                <Section style={taskBox}>
                  {overdueGardenTasks.map((task, idx) => (
                    <div key={idx} style={{ ...taskItem, borderLeftColor: '#dc2626' }}>
                      <Text style={{ ...taskTitle, color: '#dc2626' }}>
                        {task.title}
                        {task.isRecurring && <span style={recurringBadge}> 🔄</span>}
                      </Text>
                      <Text style={{ ...taskDetail, color: '#dc2626', fontWeight: '600' }}>
                        {task.dueDate}
                      </Text>
                    </div>
                  ))}
                </Section>
              </>
            )}

            {upcomingGardenTasks.length > 0 && (
              <>
                <Text style={subText}>Deze week:</Text>
                <Section style={taskBox}>
                  {upcomingGardenTasks.map((task, idx) => (
                    <div key={idx} style={{ ...taskItem, borderLeftColor: '#16a34a' }}>
                      <Text style={taskTitle}>
                        {task.title}
                        {task.isRecurring && <span style={recurringBadge}> 🔄</span>}
                      </Text>
                      <Text style={taskDetail}>
                        {task.dueDate}
                      </Text>
                    </div>
                  ))}
                </Section>
              </>
            )}
          </>
        )}

        {!hasAnyTasks && (
          <Section style={taskBox}>
            <Text style={{ ...text, textAlign: 'center' as const, color: '#16a34a' }}>
              {noTasksMessage}
            </Text>
          </Section>
        )}

        <Section style={{ textAlign: 'center' as const, margin: '32px 24px 24px 24px' }}>
          <Link
            href="https://moestuin.bosgoedt.be"
            style={button}
          >
            Naar mijn moestuin
          </Link>
        </Section>
      </Container>
    </Body>
  </Html>
)};



export default WeeklyDigestEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#333',
  fontSize: '28px',
  fontWeight: '700',
  margin: '32px 0 24px 0',
  padding: '0 24px',
};

const h2 = {
  color: '#333',
  fontSize: '20px',
  fontWeight: '600',
  margin: '32px 24px 8px 24px',
};

const text = {
  color: '#555',
  fontSize: '16px',
  lineHeight: '24px',
  padding: '0 24px',
  margin: '0 0 12px 0',
};

const subText = {
  color: '#777',
  fontSize: '14px',
  lineHeight: '20px',
  padding: '0 24px',
  margin: '0 0 16px 0',
};

const taskBox = {
  margin: '0 24px 32px 24px',
  padding: '0',
};

const taskItem = {
  margin: '0 0 20px 0',
  paddingLeft: '12px',
  borderLeft: '3px solid #e5e7eb',
};

const taskTitle = {
  color: '#16a34a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 6px 0',
};

const taskDetail = {
  color: '#666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '2px 0',
};

const recurringBadge = {
  fontSize: '12px',
};

const button = {
  backgroundColor: '#16a34a',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};
