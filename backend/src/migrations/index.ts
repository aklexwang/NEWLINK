/**
 * 모든 마이그레이션 목록 — 여기 한 곳만 고치면 된다(운영 Postgres·sqlite 공통).
 * 엔티티에 컬럼/테이블을 추가하면 반드시 마이그레이션을 만들고 여기에 추가할 것.
 * (운영은 synchronize 꺼짐 → 마이그레이션 없으면 배포 후 "column does not exist" 로 서버가 죽는다)
 * scripts/check-entity-migrations.js 가 빌드 때 이걸 검사한다.
 */
import { AddChannelStats1760852400000 } from './1760852400000-AddChannelStats';
import { AddChannelVerified1760860800000 } from './1760860800000-AddChannelVerified';
import { AddChannelDiscovery1761019200000 } from './1761019200000-AddChannelDiscovery';
import { AddCollectError1761033600000 } from './1761033600000-AddCollectError';
import { AddCollectClassifyCache1761040800000 } from './1761040800000-AddCollectClassifyCache';
import { AddChannelLanguage1761120000000 } from './1761120000000-AddChannelLanguage';
import { AddChannelVisibility1761210000000 } from './1761210000000-AddChannelVisibility';
import { AddMtprotoCollectColumns1761220000000 } from './1761220000000-AddMtprotoCollectColumns';
import { AddSnapshotActivity1761230000000 } from './1761230000000-AddSnapshotActivity';
import { AddLanguageHangulRatio1761240000000 } from './1761240000000-AddLanguageHangulRatio';
import { AddStatsRuns1761260000000 } from './1761260000000-AddStatsRuns';
import { AddUuidPkDefaults1761270000000 } from './1761270000000-AddUuidPkDefaults';
import { AddStatsRunMode1761280000000 } from './1761280000000-AddStatsRunMode';
import { AddAccessHashAndMtprotoState1761290000000 } from './1761290000000-AddAccessHashAndMtprotoState';
import { AddChannelCollectTier1761300000000 } from './1761300000000-AddChannelCollectTier';
import { AddAdminInspectJobs1761320000000 } from './1761320000000-AddAdminInspectJobs';
import { AddDiscoveryKeywords1761330000000 } from './1761330000000-AddDiscoveryKeywords';
import { AddRewardPayoutLedger1761340000000 } from './1761340000000-AddRewardPayoutLedger';
import { AddIllegalCleared1761350000000 } from './1761350000000-AddIllegalCleared';
import { AddSearchTerms1761360000000 } from './1761360000000-AddSearchTerms';
import { AddSearchLogs1761370000000 } from './1761370000000-AddSearchLogs';
import { AddTelegramOpens1761380000000 } from './1761380000000-AddTelegramOpens';
import { AddTitleLocked1761390000000 } from './1761390000000-AddTitleLocked';
import { AddChannelNextCollectAt1761400000000 } from './1761400000000-AddChannelNextCollectAt';
import { AddLinkedChat1761410000000 } from './1761410000000-AddLinkedChat';
import { AddMemberDeltas1761420000000 } from './1761420000000-AddMemberDeltas';
import { AddCategoryProposals1761430000000 } from './1761430000000-AddCategoryProposals';
import { AddCategorySuggestionsAndNotifications1761440000000 } from './1761440000000-AddCategorySuggestionsAndNotifications';
import { AddRewardToggleLog1761450000000 } from './1761450000000-AddRewardToggleLog';
import { AddAdBanners1761460000000 } from './1761460000000-AddAdBanners';
import { AddRankAds1761470000000 } from './1761470000000-AddRankAds';
import { AddAdPayments1761480000000 } from './1761480000000-AddAdPayments';
import { AddUserAdvertiser1761490000000 } from './1761490000000-AddUserAdvertiser';
import { AddAdAdvertiserAndStats1761500000000 } from './1761500000000-AddAdAdvertiserAndStats';
import { AddStoredImages1761510000000 } from './1761510000000-AddStoredImages';
import { AddChannelPostsPostedAtIndex1761520000000 } from './1761520000000-AddChannelPostsPostedAtIndex';
import { AddMemberActivities1761530000000 } from './1761530000000-AddMemberActivities';
import { AddVisitors1761540000000 } from './1761540000000-AddVisitors';
import { AddChannelJoinRequestedAt1761600000000 } from './1761600000000-AddChannelJoinRequestedAt';
import { AddChannelJoinRequestAccount1761700000000 } from './1761700000000-AddChannelJoinRequestAccount';
import { AddChannelTelegramAccessAccount1761800000000 } from './1761800000000-AddChannelTelegramAccessAccount';

export const ALL_MIGRATIONS = [
  AddChannelStats1760852400000,
  AddChannelVerified1760860800000,
  AddChannelDiscovery1761019200000,
  AddCollectError1761033600000,
  AddCollectClassifyCache1761040800000,
  AddChannelLanguage1761120000000,
  AddChannelVisibility1761210000000,
  AddMtprotoCollectColumns1761220000000,
  AddSnapshotActivity1761230000000,
  AddLanguageHangulRatio1761240000000,
  AddStatsRuns1761260000000,
  AddUuidPkDefaults1761270000000,
  AddStatsRunMode1761280000000,
  AddAccessHashAndMtprotoState1761290000000,
  AddChannelCollectTier1761300000000,
  AddAdminInspectJobs1761320000000,
  AddDiscoveryKeywords1761330000000,
  AddRewardPayoutLedger1761340000000,
  AddIllegalCleared1761350000000,
  AddSearchTerms1761360000000,
  AddSearchLogs1761370000000,
  AddTelegramOpens1761380000000,
  AddTitleLocked1761390000000,
  AddChannelNextCollectAt1761400000000,
  AddLinkedChat1761410000000,
  AddMemberDeltas1761420000000,
  AddCategoryProposals1761430000000,
  AddCategorySuggestionsAndNotifications1761440000000,
  AddRewardToggleLog1761450000000,
  AddAdBanners1761460000000,
  AddRankAds1761470000000,
  AddAdPayments1761480000000,
  AddUserAdvertiser1761490000000,
  AddAdAdvertiserAndStats1761500000000,
  AddStoredImages1761510000000,
  AddChannelPostsPostedAtIndex1761520000000,
  AddMemberActivities1761530000000,
  AddVisitors1761540000000,
  AddChannelJoinRequestedAt1761600000000,
  AddChannelJoinRequestAccount1761700000000,
  AddChannelTelegramAccessAccount1761800000000,
];
